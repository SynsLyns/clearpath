import {
  CHANNELS,
  PRODUCTS,
  REASONS,
  STATUSES,
  type Channel,
  type Product,
  type SubmissionStatus,
} from "./constants";
import {
  getSubmissions,
  getAttachments,
  getAuditEvents,
  getRuleChecks,
  getReviews,
  type SubmissionRecord,
} from "./repository";
import { statusLabel } from "./format";
import { formatUtc, truncateCreativeText, type CsvColumn, type CsvRow } from "./csv";
import { getRiskLevel } from "./rules";

export const EXPORT_KINDS = ["submissions", "decisions", "audit_events", "flags"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];
export type ExportLogKind = ExportKind | "record";

export type ExportFilters = {
  from: string;
  to: string;
  partner: string;
  product: Product | "";
  channel: Channel | "";
  status: SubmissionStatus | "";
  includeCreativeText: boolean;
};

type ExportFilterParams = Record<string, string | boolean | undefined>;

export class ExportFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportFilterError";
  }
}

export type ExportResult = {
  columns: readonly CsvColumn[];
  rows: CsvRow[];
};

const submissionColumns: CsvColumn[] = [
  { key: "submission_id", header: "submission_id" },
  { key: "version", header: "version", type: "number" },
  { key: "parent_submission_id", header: "parent_submission_id" },
  { key: "partner", header: "partner" },
  { key: "product", header: "product" },
  { key: "channel", header: "channel" },
  { key: "status", header: "status" },
  { key: "risk_score", header: "risk_score", type: "number" },
  { key: "risk_level", header: "risk_level" },
  { key: "failed_rule_ids", header: "failed_rule_ids" },
  { key: "dismissed_rule_ids", header: "dismissed_rule_ids" },
  { key: "submitted_by", header: "submitted_by" },
  { key: "submitted_at_utc", header: "submitted_at_utc" },
  { key: "first_decision_at_utc", header: "first_decision_at_utc" },
  { key: "hours_to_first_decision", header: "hours_to_first_decision" },
  { key: "final_decision", header: "final_decision" },
  { key: "final_reviewer", header: "final_reviewer" },
  { key: "final_reason_code", header: "final_reason_code" },
  { key: "qa_sample", header: "qa_sample", type: "boolean" },
  { key: "attachment_count", header: "attachment_count", type: "number" },
  { key: "attachment_names", header: "attachment_names" },
  { key: "rule_version", header: "rule_version" },
];

const decisionColumns: CsvColumn[] = [
  { key: "review_id", header: "review_id" },
  { key: "submission_id", header: "submission_id" },
  { key: "version", header: "version", type: "number" },
  { key: "partner", header: "partner" },
  { key: "product", header: "product" },
  { key: "channel", header: "channel" },
  { key: "decision", header: "decision" },
  { key: "reason_code", header: "reason_code" },
  { key: "reason_label", header: "reason_label" },
  { key: "reviewer", header: "reviewer" },
  { key: "comment", header: "comment" },
  { key: "rule_version", header: "rule_version" },
  { key: "decided_at_utc", header: "decided_at_utc" },
  { key: "hours_since_submission", header: "hours_since_submission" },
];

const auditColumns: CsvColumn[] = [
  { key: "event_id", header: "event_id" },
  { key: "submission_id", header: "submission_id" },
  { key: "version", header: "version", type: "number" },
  { key: "partner", header: "partner" },
  { key: "actor", header: "actor" },
  { key: "action", header: "action" },
  { key: "detail", header: "detail" },
  { key: "occurred_at_utc", header: "occurred_at_utc" },
];

const flagColumns: CsvColumn[] = [
  { key: "submission_id", header: "submission_id" },
  { key: "version", header: "version", type: "number" },
  { key: "partner", header: "partner" },
  { key: "product", header: "product" },
  { key: "channel", header: "channel" },
  { key: "rule_id", header: "rule_id" },
  { key: "severity", header: "severity" },
  { key: "authority", header: "authority" },
  { key: "message", header: "message" },
  { key: "snippet", header: "snippet" },
  { key: "dismissed", header: "dismissed", type: "boolean" },
  { key: "dismissed_by", header: "dismissed_by" },
  { key: "dismiss_note", header: "dismiss_note" },
  { key: "rule_version", header: "rule_version" },
  { key: "checked_at_utc", header: "checked_at_utc" },
];

export function defaultExportFilters(now = new Date()): ExportFilters {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    partner: "",
    product: "",
    channel: "",
    status: "",
    includeCreativeText: false,
  };
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseEnum<T extends string>(
  value: string | boolean | undefined,
  values: readonly T[],
  label: string,
): T | "" {
  if (!value) return "";
  if (typeof value !== "string") {
    throw new ExportFilterError(`Choose a valid ${label}.`);
  }
  if (!(values as readonly string[]).includes(value)) {
    throw new ExportFilterError(`Choose a valid ${label}.`);
  }
  return value as T;
}

export function parseExportFilters(
  params: ExportFilterParams,
  now = new Date(),
): ExportFilters {
  const defaults = defaultExportFilters(now);
  const fromValue = params.from;
  const toValue = params.to;
  if ((fromValue !== undefined && typeof fromValue !== "string") ||
    (toValue !== undefined && typeof toValue !== "string")) {
    throw new ExportFilterError("Enter valid date filters.");
  }
  const from = fromValue === undefined ? defaults.from : fromValue;
  const to = toValue === undefined ? defaults.to : toValue;
  if (from && !isDate(from)) throw new ExportFilterError("Enter a valid start date.");
  if (to && !isDate(to)) throw new ExportFilterError("Enter a valid end date.");
  if (from && to && from > to) {
    throw new ExportFilterError("The start date must be on or before the end date.");
  }
  const partnerValue = params.partner;
  if (partnerValue !== undefined && typeof partnerValue !== "string") {
    throw new ExportFilterError("Enter valid partner or campaign search text.");
  }
  const partner = partnerValue?.trim() ?? "";
  if (partner.length > 200) throw new ExportFilterError("Partner or campaign search is too long.");
  const includeCreativeText = params.includeCreativeText;
  if (includeCreativeText !== undefined &&
    includeCreativeText !== "true" && includeCreativeText !== "false" &&
    typeof includeCreativeText !== "boolean") {
    throw new ExportFilterError("Choose a valid creative-text option.");
  }

  return {
    from,
    to,
    partner,
    product: parseEnum(params.product, PRODUCTS, "product"),
    channel: parseEnum(params.channel, CHANNELS, "channel"),
    status: parseEnum(params.status, STATUSES, "status"),
    includeCreativeText: includeCreativeText === true || includeCreativeText === "true",
  };
}

function dateBounds(filters: ExportFilters) {
  return {
    start: filters.from ? new Date(`${filters.from}T00:00:00.000Z`) : null,
    end: filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : null,
  };
}

function isWithinRange(value: Date, filters: ExportFilters): boolean {
  const { start, end } = dateBounds(filters);
  return (!start || value >= start) && (!end || value <= end);
}

function matchesSubmission(submission: SubmissionRecord, filters: ExportFilters): boolean {
  return (
    (!filters.partner || submission.partner.toLocaleLowerCase().includes(filters.partner.toLocaleLowerCase())) &&
    (!filters.product || submission.product === filters.product) &&
    (!filters.channel || submission.channel === filters.channel) &&
    (!filters.status || submission.status === filters.status)
  );
}

function hoursBetween(start: Date, end: Date): string {
  return ((end.getTime() - start.getTime()) / 3_600_000).toFixed(1);
}

function groupBySubmission<T extends { submissionId: string }>(items: readonly T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(item.submissionId) ?? [];
    group.push(item);
    groups.set(item.submissionId, group);
  }
  return groups;
}

function reasonLabel(code: string | null): string {
  if (!code) return "";
  return REASONS[code as keyof typeof REASONS]?.label ?? code;
}

export async function buildExports(filters: ExportFilters): Promise<Record<ExportKind, ExportResult>> {
  const [submissions, checks, reviews, events, attachments] = await Promise.all([
    getSubmissions(),
    getRuleChecks(),
    getReviews(),
    getAuditEvents(),
    getAttachments(),
  ]);
  const submissionsById = new Map(submissions.map((item) => [item.id, item]));
  const checksBySubmission = groupBySubmission(checks);
  const reviewsBySubmission = groupBySubmission(reviews);
  const attachmentsBySubmission = groupBySubmission(attachments);

  const submissionRows = submissions
    .filter((submission) => isWithinRange(submission.createdAt, filters) && matchesSubmission(submission, filters))
    .map((submission) => {
      const rowChecks = checksBySubmission.get(submission.id) ?? [];
      const rowReviews = [...(reviewsBySubmission.get(submission.id) ?? [])]
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const firstReview = rowReviews[0];
      const finalReview = rowReviews.at(-1);
      const rowAttachments = attachmentsBySubmission.get(submission.id) ?? [];
      const result: CsvRow = {
        submission_id: submission.id,
        version: submission.version,
        parent_submission_id: submission.parentId,
        partner: submission.partner,
        product: submission.product,
        channel: submission.channel,
        status: statusLabel(submission.status),
        risk_score: submission.riskScore,
        risk_level: getRiskLevel(rowChecks.filter((check) => !check.dismissed)),
        failed_rule_ids: rowChecks
          .filter((check) => !check.passed && !check.dismissed)
          .map((check) => check.ruleId)
          .join("; "),
        dismissed_rule_ids: rowChecks
          .filter((check) => !check.passed && check.dismissed)
          .map((check) => check.ruleId)
          .join("; "),
        submitted_by: submission.submittedBy,
        submitted_at_utc: formatUtc(submission.createdAt),
        first_decision_at_utc: firstReview ? formatUtc(firstReview.createdAt) : "",
        hours_to_first_decision: firstReview ? hoursBetween(submission.createdAt, firstReview.createdAt) : "",
        final_decision: finalReview?.decision ?? "",
        final_reviewer: finalReview?.reviewer ?? "",
        final_reason_code: finalReview?.reasonCode ?? "",
        qa_sample: submission.qaSample,
        attachment_count: rowAttachments.length,
        attachment_names: rowAttachments.map((item) => item.name).join("; "),
        rule_version: submission.ruleVersion,
      };
      if (filters.includeCreativeText) result.creative_text = truncateCreativeText(submission.creativeText);
      return result;
    });

  const decisionRows = reviews
    .filter((review) => {
      const submission = submissionsById.get(review.submissionId);
      return submission && isWithinRange(review.createdAt, filters) && matchesSubmission(submission, filters);
    })
    .map((review) => {
      const submission = submissionsById.get(review.submissionId)!;
      return {
        review_id: review.id,
        submission_id: submission.id,
        version: submission.version,
        partner: submission.partner,
        product: submission.product,
        channel: submission.channel,
        decision: review.decision,
        reason_code: review.reasonCode,
        reason_label: reasonLabel(review.reasonCode),
        reviewer: review.reviewer,
        comment: review.comment,
        rule_version: review.ruleVersion,
        decided_at_utc: formatUtc(review.createdAt),
        hours_since_submission: hoursBetween(submission.createdAt, review.createdAt),
      };
    });

  const auditRows = events
    .filter((event) => {
      const submission = submissionsById.get(event.submissionId);
      return submission && isWithinRange(event.createdAt, filters) && matchesSubmission(submission, filters);
    })
    .map((event) => {
      const submission = submissionsById.get(event.submissionId)!;
      return {
        event_id: event.id,
        submission_id: submission.id,
        version: submission.version,
        partner: submission.partner,
        actor: event.actor,
        action: event.action,
        detail: event.detail,
        occurred_at_utc: formatUtc(event.createdAt),
      };
    });

  const flagRows = checks
    .filter((check) => {
      const submission = submissionsById.get(check.submissionId);
      return submission && !check.passed && isWithinRange(submission.createdAt, filters) &&
        matchesSubmission(submission, filters);
    })
    .map((check) => {
      const submission = submissionsById.get(check.submissionId)!;
      return {
        submission_id: submission.id,
        version: submission.version,
        partner: submission.partner,
        product: submission.product,
        channel: submission.channel,
        rule_id: check.ruleId,
        severity: check.severity,
        authority: check.authority,
        message: check.message,
        snippet: check.snippet,
        dismissed: check.dismissed,
        dismissed_by: check.dismissedBy,
        dismiss_note: check.dismissNote,
        rule_version: submission.ruleVersion,
        checked_at_utc: formatUtc(submission.createdAt),
      };
    });

  const sortByDate = (key: string) => (a: CsvRow, b: CsvRow) =>
    String(b[key]).localeCompare(String(a[key]));
  const columns = filters.includeCreativeText
    ? [...submissionColumns, { key: "creative_text", header: "creative_text" }]
    : submissionColumns;

  return {
    submissions: { columns, rows: submissionRows.sort(sortByDate("submitted_at_utc")) },
    decisions: { columns: decisionColumns, rows: decisionRows.sort(sortByDate("decided_at_utc")) },
    audit_events: { columns: auditColumns, rows: auditRows.sort(sortByDate("occurred_at_utc")) },
    flags: { columns: flagColumns, rows: flagRows.sort(sortByDate("checked_at_utc")) },
  };
}

export async function buildExport(kind: ExportKind, filters: ExportFilters): Promise<ExportResult> {
  return (await buildExports(filters))[kind];
}

export function exportFilterMetadata(filters: ExportFilters): string {
  return JSON.stringify(filters);
}

export function exportFilename(kind: ExportKind, filters: ExportFilters): string {
  const from = filters.from || "all-time";
  const to = filters.to || "all-time";
  return `clearpath-${kind}_${from}_to_${to}.csv`;
}
