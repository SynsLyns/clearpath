import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock3, FileText } from "lucide-react";
import { PageContainer, PageFooter, PageHeading } from "@/components/app-shell";
import { ResubmitForm } from "@/components/resubmit-form";
import {
  AuditTrail,
  FlagRows,
  HighlightedCreative,
  ReviewHistory,
  RiskBadge,
  StatusBadge,
} from "@/components/submission-details";
import { QueryToast } from "@/components/query-toast";
import { formatDate, titleCase } from "@/lib/format";
import { getAuditEvents, getRuleChecks, getReviews, getSubmissionBundle, getSubmissions } from "@/lib/repository";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SubmissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ resubmitted?: string }>;
}) {
  const session = await requireRole("submitter");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [bundle, submissions, allChecks, allReviews, allEvents] = await Promise.all([
    getSubmissionBundle(id),
    getSubmissions(),
    getRuleChecks(),
    getReviews(),
    getAuditEvents(),
  ]);
  const submission = bundle.submission;
  if (!submission || submission.submittedBy !== session.actor) notFound();

  const parent = submission.parentId
    ? submissions.find((item) => item.id === submission.parentId)
    : undefined;
  const children = submissions.filter((item) => item.parentId === submission.id);
  const submissionIds = new Set([submission.id, ...children.map((item) => item.id)]);
  if (parent) submissionIds.add(parent.id);
  const historyEvents = allEvents.filter((event) => submissionIds.has(event.submissionId));
  const priorReview = parent
    ? allReviews.filter((review) => review.submissionId === parent.id).at(-1)
    : undefined;

  return (
    <>
      <PageContainer>
        <QueryToast key={query.resubmitted ?? "none"} message={query.resubmitted ? "Your updated creative has been resubmitted." : undefined} clearKey="resubmitted" />
        <Link className="back-link" href="/submissions"><ArrowLeft size={15} /> My submissions</Link>
        <PageHeading
          eyebrow={`Submission · ${formatDate(submission.createdAt)}`}
          title={submission.partner}
          description={`${titleCase(submission.product)} · ${titleCase(submission.channel)} · Version ${submission.version}`}
          action={<StatusBadge status={submission.status} />}
        />

        <div className="detail-layout">
          <div className="detail-main-column">
            <section className="content-card">
              <div className="content-card-heading">
                <div><FileText size={17} /><h2>Creative</h2></div>
                <span>Rule set {submission.ruleVersion}</span>
              </div>
              <HighlightedCreative text={submission.creativeText} checks={bundle.checks} />
            </section>

            <section className="content-card">
              <div className="content-card-heading">
                <div><Clock3 size={17} /><h2>Automated checks</h2></div>
                <RiskBadge checks={bundle.checks} riskScore={submission.riskScore} />
              </div>
              <FlagRows checks={bundle.checks} />
            </section>

            {submission.status === "changes_requested" && (
              <section className="content-card">
                <div className="content-card-heading">
                  <div><ArrowRight size={17} /><h2>Address feedback</h2></div>
                  <span>New version</span>
                </div>
                {priorReview?.comment && (
                  <div className="reviewer-feedback">
                    <small>Feedback from {priorReview.reviewer}</small>
                    <p>{priorReview.comment}</p>
                  </div>
                )}
                <ResubmitForm
                  submissionId={submission.id}
                  initialCreative={submission.creativeText}
                  product={submission.product}
                  channel={submission.channel}
                />
              </section>
            )}

            <section className="content-card">
              <div className="content-card-heading"><div><Clock3 size={17} /><h2>Compliance decisions</h2></div></div>
              <ReviewHistory reviews={allReviews.filter((review) => submissionIds.has(review.submissionId))} />
            </section>
          </div>

          <aside className="detail-side-column">
            <section className="content-card compact-card">
              <div className="content-card-heading"><div><Clock3 size={17} /><h2>Version history</h2></div></div>
              <div className="version-history">
                {parent && <Link href={`/submissions/${parent.id}`} className="version-history-item">
                  <span className="version-dot" />
                  <span><strong>v{parent.version} · Previous creative</strong><small>{titleCase(parent.status)}</small></span>
                </Link>}
                <div className="version-history-item current">
                  <span className="version-dot" />
                  <span><strong>v{submission.version} · This creative</strong><small>{titleCase(submission.status)}</small></span>
                </div>
                {children.map((child) => <Link href={`/submissions/${child.id}`} className="version-history-item" key={child.id}>
                  <span className="version-dot" />
                  <span><strong>v{child.version} · Updated creative</strong><small>{titleCase(child.status)}</small></span>
                </Link>)}
              </div>
            </section>
            <section className="content-card compact-card">
              <div className="content-card-heading"><div><Clock3 size={17} /><h2>Activity</h2></div></div>
              <AuditTrail events={historyEvents} />
            </section>
            <div className="detail-owner-note">
              <span>Submitted by</span><strong>{submission.submittedBy}</strong>
              <small>All times shown in your local timezone.</small>
            </div>
            {allChecks.length + allReviews.length === 0 && <span className="sr-only">No review history is available.</span>}
          </aside>
        </div>
      </PageContainer>
      <PageFooter />
    </>
  );
}
