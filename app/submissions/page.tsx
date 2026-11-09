import Link from "next/link";
import { Plus, Search, Sparkles } from "lucide-react";
import { PageContainer, PageFooter, PageHeading } from "@/components/app-shell";
import { QueryToast } from "@/components/query-toast";
import { ClearFilters } from "@/components/clear-filters";
import { SubmissionFilters } from "@/components/submission-filters";
import { SubmissionTableRow } from "@/components/submission-table-row";
import { RiskBadge, StatusBadge } from "@/components/submission-details";
import { TimeAgo } from "@/components/time-ago";
import { titleCase } from "@/lib/format";
import { PRODUCTS, STATUSES } from "@/lib/constants";
import { getRuleChecks, getSubmissions } from "@/lib/repository";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    submitted?: string;
    resubmitted?: string;
    updated?: string;
    archived?: string;
    search?: string;
    product?: string;
    status?: string;
  }>;
}) {
  const session = await requireRole("submitter");
  const [allSubmissions, checks, query] = await Promise.all([
    getSubmissions(),
    getRuleChecks(),
    searchParams,
  ]);
  const ownedSubmissions = allSubmissions.filter((item) => item.submittedBy === session.actor && item.status !== "archived");
  const search = query.search?.trim() ?? "";
  const product = PRODUCTS.find((value) => value === query.product);
  const status = STATUSES.find((value) => value === query.status && value !== "archived");
  const submissions = ownedSubmissions.filter((item) =>
    (!search || item.partner.toLocaleLowerCase().includes(search.toLocaleLowerCase())) &&
    (!product || item.product === product) &&
    (!status || item.status === status),
  );
  const hasFilters = Boolean(search || product || status);
  const checkGroups = new Map<string, typeof checks>();
  for (const check of checks) {
    const group = checkGroups.get(check.submissionId) ?? [];
    group.push(check);
    checkGroups.set(check.submissionId, group);
  }
  const toast = query.archived
    ? "Request and version history archived."
    : query.updated
      ? "Your update was saved as a new version."
      : query.submitted
    ? "Submission received. Your auto-check is complete."
    : query.resubmitted
      ? "Your updated creative has been resubmitted."
      : undefined;
  const toastClearKey = query.archived ? "archived" : query.updated ? "updated" : query.submitted ? "submitted" : "resubmitted";

  return (
    <>
      <PageContainer>
        <QueryToast key={toast ?? "none"} message={toast} clearKey={toastClearKey} />
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
              <p>
                {hasFilters
                  ? `Showing ${submissions.length} of ${ownedSubmissions.length} submissions`
                  : `${ownedSubmissions.length} ${ownedSubmissions.length === 1 ? "creative" : "creatives"} in your workspace`}
              </p>
            </div>
          </div>
          {ownedSubmissions.length > 0 && (
            <SubmissionFilters
              initialSearch={search}
              initialProduct={product ?? ""}
              initialStatus={status ?? ""}
              hasFilters={hasFilters}
            />
          )}
          {submissions.length ? (
            <div className="table-scroll">
              <table className="submission-table">
                <thead>
                  <tr><th>Partner / campaign</th><th>Product</th><th>Status</th><th>Risk</th><th>Submitted</th></tr>
                </thead>
                <tbody>
                  {submissions.map((submission) => (
                    <SubmissionTableRow
                      key={submission.id}
                      href={`/submissions/${submission.id}`}
                    >
                      <td>
                        <Link className="table-primary-link" href={`/submissions/${submission.id}`}>{submission.partner}</Link>
                        {submission.version > 1 && <span className="version-tag">v{submission.version}</span>}
                        {submission.parentId && <small className="table-subline">Updated creative</small>}
                      </td>
                      <td><span className="product-text">{titleCase(submission.product)}</span><small className="table-subline">{titleCase(submission.channel)}</small></td>
                      <td><StatusBadge status={submission.status} />{submission.qaSample && <span className="qa-tag">QA sample</span>}</td>
                      <td><RiskBadge checks={checkGroups.get(submission.id) ?? []} riskScore={submission.riskScore} /></td>
                      <td><span className="table-time"><TimeAgo date={submission.createdAt} /></span></td>
                    </SubmissionTableRow>
                  ))}
                </tbody>
              </table>
            </div>
          ) : hasFilters ? (
            <div className="empty-state submission-no-results">
              <div className="empty-icon"><Search size={21} /></div>
              <h3>No matching submissions</h3>
              <p>Try a different partner or campaign name, product, or status.</p>
              <ClearFilters action="/submissions" className="button button-outline">Clear filters</ClearFilters>
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
