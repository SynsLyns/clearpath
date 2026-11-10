"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  CHANNELS,
  PRODUCTS,
  QA_SAMPLE_RATE,
  REASONS,
  RULE_VERSION,
  USERS,
  type Channel,
  type Product,
  type ReasonCode,
} from "@/lib/constants";
import { parseAttachmentPayload } from "@/lib/attachments";
import { extractAttachments } from "@/lib/attachment-extraction";
import { assertRole } from "@/lib/session";
import { db } from "@/src/prisma/db";
import { runSubmissionRules, type RuleResult } from "@/lib/rules";
import {
  buildExport,
  EXPORT_KINDS,
  exportFilterMetadata,
  exportFilename,
  parseExportFilters,
  type ExportFilters,
  type ExportKind,
} from "@/lib/exports";
import { toCsv } from "@/lib/csv";

export type ActionState = { error?: string };

function isExportFilters(value: unknown): value is ExportFilters {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const filters = value as Record<string, unknown>;
  return (
    (filters.from === undefined || typeof filters.from === "string") &&
    (filters.to === undefined || typeof filters.to === "string") &&
    (filters.partner === undefined || typeof filters.partner === "string") &&
    (filters.product === undefined || typeof filters.product === "string") &&
    (filters.channel === undefined || typeof filters.channel === "string") &&
    (filters.status === undefined || typeof filters.status === "string") &&
    (filters.includeCreativeText === undefined ||
      typeof filters.includeCreativeText === "boolean" ||
      typeof filters.includeCreativeText === "string")
  );
}

export async function exportCsv(kindInput: unknown, filtersInput: unknown) {
  const session = await assertRole("reviewer");
  if (
    typeof kindInput !== "string" ||
    !(EXPORT_KINDS as readonly string[]).includes(kindInput)
  ) {
    throw new Error("Choose a valid export type.");
  }
  if (!isExportFilters(filtersInput)) {
    throw new Error("Export filters are invalid.");
  }

  const kind = kindInput as ExportKind;
  const filters = parseExportFilters(filtersInput);
  if (kind !== "submissions") filters.includeCreativeText = false;
  const { columns, rows } = await buildExport(kind, filters);
  const csv = toCsv(columns, rows);
  if (new TextEncoder().encode(csv).byteLength > 4_000_000) {
    throw new Error("This export exceeds 4 MB. Narrow the date range or filters and try again.");
  }

  const loggedAt = new Date();
  await db.orm.public.ExportLog.create({
    actor: session.actor,
    kind,
    filters: exportFilterMetadata(filters),
    rowCount: rows.length,
    createdAt: loggedAt,
  });
  revalidatePath("/reviewer/exports");
  return {
    csv,
    filename: exportFilename(kind, filters),
    rowCount: rows.length,
    loggedAt: loggedAt.toISOString(),
  };
}

export async function logRecordExport(submissionIdInput: unknown) {
  const session = await assertRole("reviewer");
  if (typeof submissionIdInput !== "string" || !submissionIdInput.trim()) {
    throw new Error("Choose a valid submission record.");
  }
  const submissionId = submissionIdInput.trim();
  const submission = await db.orm.public.Submission.where({ id: submissionId }).first();
  if (!submission) throw new Error("Submission record not found.");

  const loggedAt = new Date();
  await db.orm.public.ExportLog.create({
    actor: session.actor,
    kind: "record",
    filters: "",
    rowCount: 1,
    createdAt: loggedAt,
  });
  revalidatePath("/reviewer/exports");
  return loggedAt.toISOString();
}

export async function chooseRole(formData: FormData) {
  const role = formData.get("role");
  if (role !== "submitter" && role !== "reviewer") {
    throw new Error("Choose a valid demo role.");
  }
  (await cookies()).set("clearpath_role", role, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(role === "reviewer" ? "/reviewer" : "/submissions");
}

function summarizeFlags(checks: readonly RuleResult[]) {
  const failures = checks.filter((check) => !check.passed);
  const high = failures.filter((check) => check.severity === "high").length;
  const medium = failures.filter((check) => check.severity === "medium").length;
  return { failures, high, medium, detail: `${high} high, ${medium} medium flags` };
}

function initialRoute(failures: readonly RuleResult[], hasAttachments = false) {
  if (hasAttachments) return { status: "pending", qaSample: false };
  if (failures.length > 0) return { status: "pending", qaSample: false };
  if (Math.random() < QA_SAMPLE_RATE) return { status: "pending", qaSample: true };
  return { status: "auto_cleared", qaSample: false };
}

async function writeChecks(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  submissionId: string,
  checks: readonly RuleResult[],
) {
  for (const check of checks) {
    await tx.orm.public.RuleCheck.create({
      submissionId,
      ruleId: check.ruleId,
      severity: check.severity,
      passed: check.passed,
      message: check.message,
      authority: check.authority,
      snippet: check.snippet,
      sourceName: check.sourceName ?? null,
    });
  }
}

type AttachmentForSubmission = {
  kind: string;
  name: string;
  url: string;
  contentType: string | null;
  sizeBytes: number | null;
  extractionStatus: string;
  extractedText: string | null;
  extractionError: string | null;
  extractionMethod: string | null;
  extractedAt: Date | null;
};

async function writeAttachments(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  submissionId: string,
  attachments: readonly AttachmentForSubmission[],
) {
  for (const attachment of attachments) {
    await tx.orm.public.Attachment.create({
      submissionId,
      kind: attachment.kind,
      name: attachment.name,
      url: attachment.url,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      extractionStatus: attachment.extractionStatus,
      extractedText: attachment.extractedText,
      extractionError: attachment.extractionError,
      extractionMethod: attachment.extractionMethod,
      extractedAt: attachment.extractedAt,
    });
  }
}

export async function createSubmission(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await assertRole("submitter");
  const partner = String(formData.get("partner") ?? "").trim();
  const product = String(formData.get("product") ?? "");
  const channel = String(formData.get("channel") ?? "");
  const creativeText = String(formData.get("creativeText") ?? "").trim();
  const parsedAttachments = parseAttachmentPayload(String(formData.get("attachments") ?? "[]"));

  if (!partner) return { error: "Enter the partner or campaign name." };
  if (!parsedAttachments.ok) return { error: parsedAttachments.error };
  const uploadedAttachments = parsedAttachments.attachments;
  if (!PRODUCTS.includes(product as Product)) {
    return { error: "Choose a valid financial product." };
  }
  if (!CHANNELS.includes(channel as Channel)) {
    return { error: "Choose a valid marketing channel." };
  }
  if (creativeText.length < 20 && uploadedAttachments.length === 0) {
    return { error: "Creative must be at least 20 characters." };
  }

  const attachments = await extractAttachments(uploadedAttachments);
  const result = runSubmissionRules(
    creativeText,
    product as Product,
    channel as Channel,
    attachments,
  );
  const { failures, detail } = summarizeFlags(result.checks);
  const routing = initialRoute(failures, attachments.length > 0);

  await db.transaction(async (tx) => {
    const submission = await tx.orm.public.Submission.create({
      partner,
      product,
      channel,
      creativeText,
      status: routing.status,
      riskScore: result.riskScore,
      ruleVersion: RULE_VERSION,
      submittedBy: session.actor,
      qaSample: routing.qaSample,
      version: 1,
      parentId: null,
    });
    await writeChecks(tx, submission.id, result.checks);
    await writeAttachments(tx, submission.id, attachments);
    await tx.orm.public.AuditEvent.create({
      submissionId: submission.id,
      actor: session.actor,
      action: "submitted",
      detail: `Auto-check: ${detail}; attachments: ${attachments.length}`,
    });

    if (routing.status === "auto_cleared") {
      await tx.orm.public.Review.create({
        submissionId: submission.id,
        reviewer: USERS.system,
        decision: "auto_cleared",
        reasonCode: null,
        comment: `No rule failures under rule set ${RULE_VERSION}`,
        ruleVersion: RULE_VERSION,
      });
      await tx.orm.public.AuditEvent.create({
        submissionId: submission.id,
        actor: USERS.system,
        action: "auto_cleared",
        detail: `Auto-cleared under rule set ${RULE_VERSION}`,
      });
    } else if (routing.qaSample) {
      await tx.orm.public.AuditEvent.create({
        submissionId: submission.id,
        actor: USERS.system,
        action: "qa_sampled",
        detail: "Selected for the 10% quality-assurance sample",
      });
    }
  });

  revalidatePath("/submissions");
  revalidatePath("/reviewer");
  redirect("/submissions?submitted=1");
}

class ActionStateError extends Error {}

export async function decide(
  submissionId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await assertRole("reviewer");
  const decision = String(formData.get("decision") ?? "");
  const reasonCode = String(formData.get("reasonCode") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();
  const validDecision = ["approved", "rejected", "changes_requested"].includes(
    decision,
  );
  const validReason = Object.keys(REASONS).includes(reasonCode);
  if (!validDecision) return { error: "Choose a valid compliance decision." };
  if (reasonCode && !validReason) return { error: "Choose a valid decision reason." };
  if (decision !== "approved" && !reasonCode) {
    return { error: "Choose a reason for rejecting or requesting changes." };
  }
  if (
    decision !== "approved" &&
    (reasonCode === "no_issues" || reasonCode === "false_positive_flags")
  ) {
    return { error: "That reason is only available when approving." };
  }
  if (decision !== "approved" && comment.length < 3) {
    return { error: "Add a comment so Marketing knows what to address." };
  }

  const reason = reasonCode ? (reasonCode as ReasonCode) : null;
  const decidedAt = new Date();
  try {
    await db.transaction(async (tx) => {
      const submission = await tx.orm.public.Submission
        .where({ id: submissionId })
        .forUpdate()
        .first();
      if (!submission || submission.status !== "pending") {
        const previous = await tx.orm.public.Review
          .where({ submissionId })
          .orderBy((review) => review.createdAt.desc())
          .first();
        throw new ActionStateError(
          previous
            ? `Already decided by ${previous.reviewer}.`
            : "This submission is no longer pending review.",
        );
      }

      const checks = await tx.orm.public.RuleCheck.where({ submissionId }).all();
      const unresolvedHigh = checks.filter(
        (check) => !check.passed && !check.dismissed && check.severity === "high",
      ).length;
      if (decision === "approved" && unresolvedHigh > 0 && !comment) {
        throw new ActionStateError(
          `Approving with ${unresolvedHigh} unresolved high-severity flags requires a comment.`,
        );
      }

      await tx.orm.public.Review.create({
        submissionId,
        reviewer: session.actor,
        decision,
        reasonCode: reason,
        comment,
        ruleVersion: submission.ruleVersion,
        createdAt: decidedAt,
      });
      await tx.orm.public.Submission.where({ id: submissionId, status: "pending" })
        .updateAll({ status: decision });
      await tx.orm.public.AuditEvent.create({
        submissionId,
        actor: session.actor,
        action: decision,
        detail: reason
          ? `${REASONS[reason].label}${comment ? `: ${comment}` : ""}`
          : `Approved under rule set ${submission.ruleVersion}${comment ? `: ${comment}` : ""}`,
        createdAt: decidedAt,
      });
    });
  } catch (error) {
    if (error instanceof ActionStateError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/reviewer");
  revalidatePath("/submissions");
  redirect(`/reviewer?decided=${encodeURIComponent(decision)}&at=${encodeURIComponent(decidedAt.toISOString())}`);
}

export async function dismissFlag(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await assertRole("reviewer");
  const ruleCheckId = String(formData.get("ruleCheckId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!ruleCheckId) return { error: "Choose a flag to dismiss." };
  if (note.length < 3) return { error: "Add a short note explaining the override." };

  try {
    await db.transaction(async (tx) => {
      const initialCheck = await tx.orm.public.RuleCheck
        .where({ id: ruleCheckId })
        .first();
      if (!initialCheck) throw new ActionStateError("Rule flag not found.");
      const submission = await tx.orm.public.Submission.where({
        id: initialCheck.submissionId,
      }).forUpdate().first();
      if (!submission || submission.status !== "pending") {
        throw new ActionStateError(
          "Flags can only be dismissed while a submission is pending.",
        );
      }
      const check = await tx.orm.public.RuleCheck
        .where({ id: ruleCheckId })
        .first();
      if (!check) throw new ActionStateError("Rule flag not found.");
      if (!check.passed && !check.dismissed) {
        await tx.orm.public.RuleCheck.where({ id: ruleCheckId }).updateAll({
          dismissed: true,
          dismissedBy: session.actor,
          dismissNote: note,
        });
        const checks = await tx.orm.public.RuleCheck.where({
          submissionId: submission.id,
        }).all();
        const riskScore = checks.reduce(
          (score, current) =>
            current.passed || current.dismissed
              ? score
              : score + (current.severity === "high" ? 3 : 1),
          0,
        );
        await tx.orm.public.Submission.where({ id: submission.id }).updateAll({
          riskScore,
        });
        await tx.orm.public.AuditEvent.create({
          submissionId: submission.id,
          actor: session.actor,
          action: "flag_dismissed",
          detail: `${check.ruleId}: ${note}`,
        });
      }
    });
  } catch (error) {
    if (error instanceof ActionStateError) return { error: error.message };
    throw error;
  }

  revalidatePath("/reviewer");
  redirect("/reviewer?flagDismissed=1");
}

export async function updateSubmission(
  submissionId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await assertRole("submitter");
  const partner = String(formData.get("partner") ?? "").trim();
  const product = String(formData.get("product") ?? "");
  const channel = String(formData.get("channel") ?? "");
  const creativeText = String(formData.get("creativeText") ?? "").trim();
  const addedAttachments = parseAttachmentPayload(String(formData.get("attachments") ?? "[]"));

  if (!partner) return { error: "Enter the partner or campaign name." };
  if (!addedAttachments.ok) return { error: addedAttachments.error };
  const newAttachments = addedAttachments.attachments;
  if (!PRODUCTS.includes(product as Product)) {
    return { error: "Choose a valid financial product." };
  }
  if (!CHANNELS.includes(channel as Channel)) {
    return { error: "Choose a valid marketing channel." };
  }
  const extractedNewAttachments = await extractAttachments(newAttachments);
  try {
    await db.transaction(async (tx) => {
      const currentRecords = await tx.orm.public.Submission.all();
      const selected = currentRecords.find((item) => item.id === submissionId);
      if (!selected || selected.submittedBy !== session.actor) {
        throw new ActionStateError("This request is not available to your account.");
      }
      const byId = new Map(currentRecords.map((item) => [item.id, item]));
      let root = selected;
      while (root.parentId) {
        const ancestor = byId.get(root.parentId);
        if (!ancestor) throw new Error(`Version history is incomplete for request ${root.id}.`);
        root = ancestor;
      }
      const lockedRoot = await tx.orm.public.Submission
        .where({ id: root.id })
        .forUpdate()
        .first();
      if (!lockedRoot) throw new ActionStateError("This request no longer exists.");
      const parent = selected.id === root.id
        ? lockedRoot
        : await tx.orm.public.Submission
            .where({ id: selected.id })
            .forUpdate()
            .first();
      if (!parent || parent.submittedBy !== session.actor) {
        throw new ActionStateError("This request is not available to your account.");
      }
      if (parent.status === "archived" || parent.status === "superseded") {
        throw new ActionStateError("Only the latest, active request version can be updated.");
      }
      const children = await tx.orm.public.Submission
        .where({ parentId: parent.id })
        .all();
      if (children.length) {
        throw new ActionStateError("A newer version already exists for this request.");
      }

      const parentAttachments = await tx.orm.public.Attachment
        .where({ submissionId: parent.id })
        .all();
      if (parentAttachments.length + newAttachments.length > 5) {
        throw new ActionStateError("A request can have up to 5 attachments, including earlier versions.");
      }
      if (creativeText.length < 20 && parentAttachments.length + newAttachments.length === 0) {
        throw new ActionStateError("Creative must be at least 20 characters unless an attachment is included.");
      }
      const attachments = [
        ...parentAttachments,
        ...extractedNewAttachments,
      ];
      const result = runSubmissionRules(
        creativeText,
        product as Product,
        channel as Channel,
        attachments,
      );
      const { failures, detail } = summarizeFlags(result.checks);
      const routing = initialRoute(failures, attachments.length > 0);
      const child = await tx.orm.public.Submission.create({
        partner,
        product,
        channel,
        creativeText,
        status: routing.status,
        riskScore: result.riskScore,
        ruleVersion: RULE_VERSION,
        submittedBy: session.actor,
        qaSample: routing.qaSample,
        version: parent.version + 1,
        parentId: parent.id,
      });
      await writeChecks(tx, child.id, result.checks);
      await writeAttachments(tx, child.id, attachments);
      await tx.orm.public.Submission.where({ id: parent.id }).updateAll({
        status: "superseded",
      });
      await tx.orm.public.AuditEvent.create({
        submissionId: parent.id,
        actor: session.actor,
        action: "superseded",
        detail: `Superseded by v${child.version} after a requester update.`,
      });
      await tx.orm.public.AuditEvent.create({
        submissionId: child.id,
        actor: session.actor,
        action: "updated",
        detail: `Updated from v${parent.version}. Auto-check: ${detail}; attachments: ${attachments.length}`,
      });

      if (routing.status === "auto_cleared") {
        await tx.orm.public.Review.create({
          submissionId: child.id,
          reviewer: USERS.system,
          decision: "auto_cleared",
          reasonCode: null,
          comment: `No rule failures under rule set ${RULE_VERSION}`,
          ruleVersion: RULE_VERSION,
        });
        await tx.orm.public.AuditEvent.create({
          submissionId: child.id,
          actor: USERS.system,
          action: "auto_cleared",
          detail: `Auto-cleared under rule set ${RULE_VERSION}`,
        });
      } else if (routing.qaSample) {
        await tx.orm.public.AuditEvent.create({
          submissionId: child.id,
          actor: USERS.system,
          action: "qa_sampled",
          detail: "Selected for the 10% quality-assurance sample",
        });
      }
    });
  } catch (error) {
    if (error instanceof ActionStateError) return { error: error.message };
    throw error;
  }

  revalidatePath("/submissions");
  revalidatePath("/reviewer");
  revalidatePath("/reviewer/requests");
  revalidatePath("/analytics");
  redirect("/submissions?updated=1");
}

export async function archiveSubmission(submissionId: string) {
  const session = await assertRole("submitter");

  await db.transaction(async (tx) => {
    const records = await tx.orm.public.Submission.all();
    const selected = records.find((item) => item.id === submissionId);
    if (!selected || selected.submittedBy !== session.actor) {
      throw new Error("This request is not available to your account.");
    }

    const byId = new Map(records.map((item) => [item.id, item]));
    let root = selected;
    while (root.parentId) {
      const parent = byId.get(root.parentId);
      if (!parent) throw new Error(`Version history is incomplete for request ${root.id}.`);
      root = parent;
    }

    const lockedRoot = await tx.orm.public.Submission
      .where({ id: root.id })
      .forUpdate()
      .first();
    if (!lockedRoot) throw new Error(`Request version ${root.id} no longer exists.`);
    const refreshedRecords = await tx.orm.public.Submission.all();
    const refreshedById = new Map(refreshedRecords.map((item) => [item.id, item]));
    const refreshedSelected = refreshedById.get(submissionId);
    if (!refreshedSelected || refreshedSelected.submittedBy !== session.actor) {
      throw new Error("This request is not available to your account.");
    }

    let refreshedRoot = refreshedSelected;
    while (refreshedRoot.parentId) {
      const parent = refreshedById.get(refreshedRoot.parentId);
      if (!parent) throw new Error(`Version history is incomplete for request ${refreshedRoot.id}.`);
      refreshedRoot = parent;
    }

    const lineage = [refreshedRoot];
    for (let index = 0; index < lineage.length; index += 1) {
      lineage.push(...refreshedRecords.filter((item) => item.parentId === lineage[index].id));
    }

    for (const item of lineage) {
      const locked = await tx.orm.public.Submission
        .where({ id: item.id })
        .forUpdate()
        .first();
      if (!locked) throw new Error(`Request version ${item.id} no longer exists.`);
      if (locked.submittedBy !== session.actor) {
        throw new Error("This request history contains a version that is not available to your account.");
      }
      if (locked.status === "archived") continue;
      await tx.orm.public.Submission.where({ id: locked.id }).updateAll({
        status: "archived",
      });
      await tx.orm.public.AuditEvent.create({
        submissionId: locked.id,
        actor: session.actor,
        action: "archived",
        detail: `Archived request version ${locked.version} (previous status: ${locked.status}).`,
      });
    }
  });

  revalidatePath("/submissions");
  revalidatePath("/reviewer");
  revalidatePath("/reviewer/requests");
  revalidatePath("/analytics");
  redirect("/submissions?archived=1");
}
