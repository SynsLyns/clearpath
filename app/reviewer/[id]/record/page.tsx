import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { PageContainer, PageFooter, PageHeading } from "@/components/app-shell";
import { PrintRecordButton } from "@/components/print-record-button";
import {
  getAttachments,
  getAuditEvents,
  getReviews,
  getRuleChecks,
  getSubmissionVersionLineage,
  getSubmissions,
} from "@/lib/repository";
import { formatUtc } from "@/lib/csv";
import { titleCase } from "@/lib/format";
import { REASONS } from "@/lib/constants";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

function reasonLabel(code: string | null): string {
  if (!code) return "";
  return REASONS[code as keyof typeof REASONS]?.label ?? titleCase(code);
}

function sizeLabel(sizeBytes: number | null): string {
  if (sizeBytes == null) return "—";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function ComplianceRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const reviewer = await requireRole("reviewer");
  const { id } = await params;
  const [submissions, allChecks, allReviews, allEvents, allAttachments] = await Promise.all([
    getSubmissions(),
    getRuleChecks(),
    getReviews(),
    getAuditEvents(),
    getAttachments(),
  ]);
  const submission = submissions.find((item) => item.id === id);
  if (!submission) notFound();

  const lineage = getSubmissionVersionLineage(submissions, submission.id);
  const versionById = new Map(lineage.map((item) => [item.id, item.version]));
  const versionIds = new Set(versionById.keys());
  const checks = allChecks.filter((check) => versionIds.has(check.submissionId));
  const reviews = allReviews.filter((review) => versionIds.has(review.submissionId));
  const events = allEvents.filter((event) => versionIds.has(event.submissionId));
  const attachments = allAttachments.filter((attachment) => versionIds.has(attachment.submissionId));
  const generatedAt = new Date();
  const failedChecks = checks.filter((check) => !check.passed);

  return (
    <>
      <PageContainer>
        <div className="record-top-actions no-print">
          <Link className="back-link" href={`/reviewer/${submission.id}?from=all`}>
            <ArrowLeft size={15} /> Back to submission
          </Link>
          <PrintRecordButton submissionId={submission.id} />
        </div>
        <article className="compliance-record">
          <header className="record-header">
            <div className="record-brand"><span className="record-brand-mark">C</span><strong>ClearPath</strong><span>Marketing compliance record</span></div>
            <div className="record-meta">
              <span>Generated {formatUtc(generatedAt)} UTC by {reviewer.actor}</span>
              <span>Submission {submission.id} · Version {submission.version}</span>
            </div>
            <PageHeading
              eyebrow={`${titleCase(submission.product)} · ${titleCase(submission.channel)} · ${titleCase(submission.status)}`}
              title={submission.partner}
              description={`Submitted by ${submission.submittedBy} on ${formatUtc(submission.createdAt)} UTC`}
            />
          </header>

          <section className="record-section">
            <h2>Submission and version history</h2>
            <dl className="record-facts">
              <div><dt>Submission ID</dt><dd>{submission.id}</dd></div>
              <div><dt>Version</dt><dd>v{submission.version}</dd></div>
              <div><dt>Rule set</dt><dd>{submission.ruleVersion}</dd></div>
              <div><dt>Risk score</dt><dd>{submission.riskScore}</dd></div>
            </dl>
            <ol className="record-version-list">
              {lineage.map((version) => (
                <li key={version.id}>
                  <Link href={`/reviewer/${version.id}?from=all`}>v{version.version}</Link>
                  <span>{version.id}</span>
                  <span>{titleCase(version.status)}</span>
                  <time>{formatUtc(version.createdAt)} UTC</time>
                </li>
              ))}
            </ol>
          </section>

          <section className="record-section">
            <h2><FileText size={16} /> Creative</h2>
            <div className="record-creative">{submission.creativeText || "No creative text was provided."}</div>
          </section>

          <section className="record-section">
            <h2>Rule flags ({failedChecks.length})</h2>
            {failedChecks.length ? (
              <div className="table-scroll">
                <table className="record-table">
                  <thead><tr><th>Version</th><th>Rule</th><th>Severity</th><th>Authority</th><th>Snippet</th><th>Dismissal</th></tr></thead>
                  <tbody>
                    {failedChecks.map((check) => (
                      <tr key={check.id}>
                        <td>v{versionById.get(check.submissionId)}</td>
                        <td>{check.ruleId}<small>{check.message}</small></td>
                        <td>{titleCase(check.severity)}</td>
                        <td>{check.authority ?? "Not recorded"}</td>
                        <td>{check.snippet}</td>
                        <td>{check.dismissed ? `Dismissed by ${check.dismissedBy ?? "reviewer"}${check.dismissNote ? `: ${check.dismissNote}` : ""}` : "Not dismissed"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="record-empty">No failed rules.</p>}
          </section>

          <section className="record-section">
            <h2>Decisions</h2>
            {reviews.length ? (
              <div className="table-scroll">
                <table className="record-table">
                  <thead><tr><th>Version</th><th>Decision</th><th>Reason</th><th>Reviewer</th><th>Comment</th><th>Decided (UTC)</th></tr></thead>
                  <tbody>
                    {reviews.map((review) => (
                      <tr key={review.id}>
                        <td>v{versionById.get(review.submissionId)}</td>
                        <td>{titleCase(review.decision)}</td>
                        <td>{reasonLabel(review.reasonCode)}</td>
                        <td>{review.reviewer}</td>
                        <td>{review.comment || "—"}</td>
                        <td>{formatUtc(review.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="record-empty">No decisions recorded.</p>}
          </section>

          <section className="record-section">
            <h2>Audit trail</h2>
            {events.length ? (
              <ol className="record-audit-list">
                {events.map((event) => (
                  <li key={event.id}>
                    <time>{formatUtc(event.createdAt)} UTC</time>
                    <strong>{titleCase(event.action)}</strong>
                    <span>v{versionById.get(event.submissionId)} · {event.actor}</span>
                    <p>{event.detail}</p>
                  </li>
                ))}
              </ol>
            ) : <p className="record-empty">No audit events recorded.</p>}
          </section>

          <section className="record-section">
            <h2>Attachments ({attachments.length})</h2>
            {attachments.length ? (
              <ul className="record-attachment-list">
                {attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <div>
                      <strong>{attachment.name}</strong>
                      <span>v{versionById.get(attachment.submissionId)} · {attachment.contentType ?? attachment.kind} · {sizeLabel(attachment.sizeBytes)}</span>
                    </div>
                    {attachment.kind === "file" ? (
                      <a href={`/api/attachments/${attachment.id}`}>Open through ClearPath</a>
                    ) : (
                      <Link href={`/reviewer/${attachment.submissionId}?from=all`}>View link on submission</Link>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p className="record-empty">No attachments.</p>}
          </section>

          <footer className="record-footer">Rules are illustrative, not legal advice.</footer>
        </article>
      </PageContainer>
      <PageFooter />
    </>
  );
}
