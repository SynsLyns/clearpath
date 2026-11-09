import Link from "next/link";
import { ArrowRight, Plus, Search, Sparkles } from "lucide-react";
import { PageContainer, PageFooter, PageHeading } from "@/components/app-shell";
import { QueryToast } from "@/components/query-toast";
import { RiskBadge, StatusBadge } from "@/components/submission-details";
import { TimeAgo } from "@/components/time-ago";
import { titleCase } from "@/lib/format";
import { getRuleChecks, getSubmissions } from "@/lib/repository";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; resubmitted?: string }>;
}) {
  const session = await requireRole("submitter");
  const [allSubmissions, checks, query] = await Promise.all([
    getSubmissions(),
    getRuleChecks(),
    searchParams,
  ]);
  const submissions = allSubmissions.filter((item) => item.submittedBy === session.actor);
  const checkGroups = new Map<string, typeof checks>();
  for (const check of checks) {
    const group = checkGroups.get(check.submissionId) ?? [];
    group.push(check);
    checkGroups.set(check.submissionId, group);
  }
  const toast = query.submitted
    ? "Submission received. Your auto-check is complete."
    : query.resubmitted
      ? "Your updated creative has been resubmitted."
      : undefined;

  return (
    <>
      <PageContainer>
        <QueryToast key={toast ?? "none"} message={toast} clearKey={query.submitted ? "submitted" : "resubmitted"} />
        <PageHeading
          eyebrow="Marketing workspace"
          title="My submissions"
          description="See every creative, compliance decision, and next step in one place."
          action={<Link className="button button-primary" href="/submit"><Plus size={16} /> New submission</Link>}
        />
        <section className="list-panel">
          <div className="list-panel-top">
            <div>
              <h2>Submission history</h2>
              <p>{submissions.length} {submissions.length === 1 ? "creative" : "creatives"} in your workspace</p>
            </div>
            <div className="list-filter"><Search size={15} /><span>Most recent first</span></div>
          </div>
          {submissions.length ? (
            <div className="table-scroll">
              <table className="submission-table">
                <thead>
                  <tr><th>Partner / campaign</th><th>Product</th><th>Status</th><th>Risk</th><th>Submitted</th><th><span className="sr-only">Open</span></th></tr>
                </thead>
                <tbody>
                  {submissions.map((submission) => (
                    <tr key={submission.id}>
                      <td>
                        <Link className="table-primary-link" href={`/submissions/${submission.id}`}>{submission.partner}</Link>
                        {submission.version > 1 && <span className="version-tag">v{submission.version}</span>}
                        {submission.parentId && <small className="table-subline">Updated creative</small>}
                      </td>
                      <td><span className="product-text">{titleCase(submission.product)}</span><small className="table-subline">{titleCase(submission.channel)}</small></td>
                      <td><StatusBadge status={submission.status} />{submission.qaSample && <span className="qa-tag">QA sample</span>}</td>
                      <td><RiskBadge checks={checkGroups.get(submission.id) ?? []} riskScore={submission.riskScore} /></td>
                      <td><span className="table-time"><TimeAgo date={submission.createdAt} /></span></td>
                      <td><Link className="table-open" href={`/submissions/${submission.id}`} aria-label={`Open ${submission.partner}`}><ArrowRight size={16} /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon"><Sparkles size={21} /></div>
              <h3>No submissions yet</h3>
              <p>Create your first submission to start a clearer review cycle.</p>
              <Link className="button button-primary" href="/submit"><Plus size={16} /> Create a submission</Link>
            </div>
          )}
        </section>
      </PageContainer>
      <PageFooter />
    </>
  );
}
