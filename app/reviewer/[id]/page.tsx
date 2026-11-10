import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock3, FileText, GitCompareArrows } from "lucide-react";
import { PageContainer, PageFooter, PageHeading } from "@/components/app-shell";
import {
  AuditTrail,
  DecisionForm,
  FlagRows,
  HighlightedCreative,
  ReviewHistory,
  RiskBadge,
  StatusBadge,
} from "@/components/submission-details";
import { QueryToast } from "@/components/query-toast";
import { REASONS } from "@/lib/constants";
import { formatDate, statusLabel, titleCase } from "@/lib/format";
import {
  getPendingQueue,
  getRuleChecks,
  getReviews,
  getSubmissionBundle,
  getSubmissionVersionLineage,
  getSubmissions,
} from "@/lib/repository";
import { requireRole } from "@/lib/session";
import { SubmissionVersionHistory } from "@/components/submission-version-history";
import { AttachmentPreviews } from "@/components/attachment-previews";

export const dynamic = "force-dynamic";

export default async function ReviewerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ decided?: string; at?: string; from?: string }>;
}) {
  await requireRole("reviewer");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [bundle, submissions, allChecks, reviews] = await Promise.all([
    getSubmissionBundle(id),
    getSubmissions(),
    getRuleChecks(),
    getReviews(),
  ]);
  const submission = bundle.submission;
  if (!submission) notFound();

  const parent = submission.parentId
    ? submissions.find((item) => item.id === submission.parentId)
    : undefined;
  const parentChecks = parent
    ? allChecks.filter((check) => check.submissionId === parent.id)
    : [];
  const parentReview = parent
    ? reviews.filter((review) => review.submissionId === parent.id).at(-1)
    : undefined;
  const pending = getPendingQueue(submissions.filter((item) => item.status === "pending"));
  const lineage = getSubmissionVersionLineage(submissions, submission.id);
  const navigationItems = query.from === "all" ? submissions : pending;
  const queueIndex = navigationItems.findIndex((item) => item.id === submission.id);
  const previous = queueIndex > 0 ? navigationItems[queueIndex - 1] : undefined;
  const next = queueIndex >= 0 ? navigationItems[queueIndex + 1] : undefined;
  const detailHref = (itemId: string) =>
    `/reviewer/${itemId}${query.from === "all" ? "?from=all" : ""}`;
  const returnHref = query.from === "all" ? "/reviewer/requests" : "/reviewer";
  const unresolvedHigh = bundle.checks.filter(
    (check) => !check.passed && !check.dismissed && check.severity === "high",
  ).length;
  const undismissedMessages = bundle.checks
    .filter((check) => !check.passed && !check.dismissed)
    .map((check) => check.message);
  const autoDraftComment = undismissedMessages.length
    ? `Please fix: ${undismissedMessages.join(" ")}`
    : "";
  const toastTime = query.at ? new Date(query.at) : null;
  const toastMessage = query.decided
    ? `${statusLabel(query.decided)}${toastTime && !Number.isNaN(toastTime.getTime()) ? `, logged at ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(toastTime)}` : ""}.`
    : undefined;

  return (
    <>
      <PageContainer>
        <QueryToast key={toastMessage ?? "none"} message={toastMessage} clearKey="decided" />
        <Link className="back-link" href={returnHref}><ArrowLeft size={15} /> {query.from === "all" ? "All requests" : "Review queue"}</Link>
        <PageHeading
          eyebrow={`Compliance review · v${submission.version}`}
          title={submission.partner}
          description={`${titleCase(submission.product)} · ${titleCase(submission.channel)} · Submitted ${formatDate(submission.createdAt)}`}
          action={
            <div className="reviewer-detail-actions">
              <StatusBadge status={submission.status} />
              <Link className="button button-outline" href={`/reviewer/${submission.id}/record`}>
                <FileText size={14} /> Compliance record
              </Link>
            </div>
          }
        />
        <div className="reviewer-workspace">
          <div className="reviewer-main">
            {submission.version > 1 && parent && (
              <section className="content-card changes-card">
                <div className="content-card-heading">
                  <div><GitCompareArrows size={17} /><h2>Changes since v1</h2></div>
                  <Link href={`/submissions/${parent.id}`}>View previous version <ArrowRight size={14} /></Link>
                </div>
                <ChangeSummary prior={parentChecks} current={bundle.checks} />
                {parentReview && (
                  <div className="prior-decision">
                    <small>Previous review by {parentReview.reviewer}</small>
                    <strong>{parentReview.reasonCode ? REASONS[parentReview.reasonCode as keyof typeof REASONS]?.label ?? titleCase(parentReview.reasonCode) : titleCase(parentReview.decision)}</strong>
                    {parentReview.comment && <p>{parentReview.comment}</p>}
                  </div>
                )}
              </section>
            )}

            <section className="content-card">
              <div className="content-card-heading">
                <div><FileText size={17} /><h2>Creative</h2></div>
                <span>Rule set {submission.ruleVersion}</span>
              </div>
              <HighlightedCreative text={submission.creativeText} checks={bundle.checks} />
              <div className="creative-meta"><span>Submitted by {submission.submittedBy}</span><RiskBadge checks={bundle.checks} riskScore={submission.riskScore} /></div>
            </section>

            <AttachmentPreviews attachments={bundle.attachments} showExtractedText />

            <section className="content-card">
              <div className="content-card-heading">
                <div><Clock3 size={17} /><h2>Rule flags</h2></div>
                <span>{bundle.checks.filter((check) => !check.passed && !check.dismissed).length} unresolved</span>
              </div>
              <FlagRows checks={bundle.checks} canDismiss={submission.status === "pending"} />
            </section>

            <section className="content-card">
              <div className="content-card-heading"><div><Clock3 size={17} /><h2>Audit trail</h2></div></div>
              <AuditTrail events={bundle.events} />
            </section>
          </div>

          <aside className="reviewer-side">
            <SubmissionVersionHistory
              submissions={lineage}
              currentId={submission.id}
              hrefFor={(versionId) => `/reviewer/${versionId}?from=all`}
            />
            {submission.status === "pending" ? (
              <section className="content-card decision-card">
                <div className="decision-heading">
                  <p className="eyebrow">Reviewer decision</p>
                  <h2>Close the loop.</h2>
                  <p>Choose an outcome. Every decision is recorded with its reason and rule version.</p>
                </div>
                <DecisionForm
                  submissionId={submission.id}
                  unresolvedHigh={unresolvedHigh}
                  autoDraftComment={autoDraftComment}
                  nextHref={next ? `/reviewer/${next.id}` : undefined}
                  previousHref={previous ? `/reviewer/${previous.id}` : undefined}
                />
              </section>
            ) : (
              <section className="content-card decision-card">
                <div className="decision-heading">
                  <p className="eyebrow">Review complete</p>
                  <h2>{titleCase(submission.status)}.</h2>
                  <p>This submission is no longer waiting in the review queue.</p>
                </div>
                <ReviewHistory reviews={bundle.reviews} />
              </section>
            )}
            <div className="queue-neighbors">
              <span>{query.from === "all" ? "All requests navigation" : "Queue navigation"}</span>
              <div>
                {previous ? <Link href={detailHref(previous.id)}><ArrowLeft size={14} /> Previous</Link> : <span className="neighbor-disabled"><ArrowLeft size={14} /> Previous</span>}
                {next ? <Link href={detailHref(next.id)}>Next <ArrowRight size={14} /></Link> : <span className="neighbor-disabled">Next <ArrowRight size={14} /></span>}
              </div>
            </div>
          </aside>
        </div>
      </PageContainer>
      <PageFooter />
    </>
  );
}

function ChangeSummary({
  prior,
  current,
}: {
  prior: Awaited<ReturnType<typeof getRuleChecks>>;
  current: Awaited<ReturnType<typeof getRuleChecks>>;
}) {
  const checkKey = (check: (typeof prior)[number]) =>
    `${check.ruleId}\u0000${check.sourceName ?? ""}`;
  const priorById = new Map(prior.map((check) => [checkKey(check), check]));
  const currentById = new Map(current.map((check) => [checkKey(check), check]));
  const resolved: string[] = [];
  const stillFailing: string[] = [];
  const newlyFailing: string[] = [];

  for (const [key, check] of currentById) {
    const wasFailed = priorById.get(key)?.passed === false;
    const isFailed = !check.passed;
    const label = check.sourceName
      ? `${check.ruleId} (${check.sourceName})`
      : check.ruleId;
    if (wasFailed && !isFailed) resolved.push(label);
    else if (wasFailed && isFailed) stillFailing.push(label);
    else if (!wasFailed && isFailed) newlyFailing.push(label);
  }

  const groups = [
    { title: "Resolved", items: resolved, className: "diff-resolved" },
    { title: "Still failing", items: stillFailing, className: "diff-still" },
    { title: "New", items: newlyFailing, className: "diff-new" },
  ];
  return (
    <div className="change-summary">
      {groups.map((group) => (
        <div className={`change-summary-group ${group.className}`} key={group.title}>
          <span>{group.title}</span>
          {group.items.length
            ? <ul>{group.items.map((rule) => <li key={rule}>{rule}</li>)}</ul>
            : <p>None</p>}
        </div>
      ))}
    </div>
  );
}
