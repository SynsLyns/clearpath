import Link from "next/link";
import { Inbox, Search } from "lucide-react";
import { PageContainer, PageFooter, PageHeading } from "@/components/app-shell";
import { ClearFilters } from "@/components/clear-filters";
import { SubmissionFilters } from "@/components/submission-filters";
import { SubmissionTableRow } from "@/components/submission-table-row";
import { RiskBadge, StatusBadge } from "@/components/submission-details";
import { TimeAgo } from "@/components/time-ago";
import { PRODUCTS, STATUSES } from "@/lib/constants";
import { titleCase } from "@/lib/format";
import { getRuleChecks, getSubmissions } from "@/lib/repository";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ReviewerRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; product?: string; status?: string }>;
}) {
  await requireRole("reviewer");
  const [allSubmissions, checks, query] = await Promise.all([
    getSubmissions(),
    getRuleChecks(),
    searchParams,
  ]);
  const search = query.search?.trim() ?? "";
  const product = PRODUCTS.find((value) => value === query.product);
  const status = STATUSES.find((value) => value === query.status);
  const submissions = allSubmissions.filter((item) =>
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

  return (
    <>
      <PageContainer>
        <div className="reviewer-tabs" aria-label="Reviewer views">
          <Link className="reviewer-tab" href="/reviewer">Review queue</Link>
          <Link className="reviewer-tab reviewer-tab-active" href="/reviewer/requests" aria-current="page">All requests</Link>
        </div>
        <PageHeading
          eyebrow="Compliance workspace"
          title="All requests"
          description="Review current and previous submissions, decisions, and resubmissions."
        />
        <section className="list-panel reviewer-requests-panel">
          <div className="list-panel-top">
            <div>
              <h2>Submission history</h2>
              <p>
                {hasFilters
                  ? `Showing ${submissions.length} of ${allSubmissions.length} requests`
                  : `${allSubmissions.length} ${allSubmissions.length === 1 ? "request" : "requests"} across all statuses`}
              </p>
            </div>
          </div>
          {allSubmissions.length > 0 && (
            <SubmissionFilters
              initialSearch={search}
              initialProduct={product ?? ""}
              initialStatus={status ?? ""}
              hasFilters={hasFilters}
              clearAction="/reviewer/requests"
              includeArchived
            />
          )}
          {submissions.length ? (
            <div className="table-scroll">
              <table className="submission-table reviewer-requests-table">
                <thead>
                  <tr><th>Partner / campaign</th><th>Product</th><th>Status</th><th>Risk</th><th>Submitted</th></tr>
                </thead>
                <tbody>
                  {submissions.map((submission) => (
                    <SubmissionTableRow
                      key={submission.id}
                      href={`/reviewer/${submission.id}?from=all`}
                    >
                      <td>
                        <Link className="table-primary-link" href={`/reviewer/${submission.id}?from=all`}>{submission.partner}</Link>
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
              <h3>No matching requests</h3>
              <p>Try a different partner or campaign, product, or status.</p>
              <ClearFilters action="/reviewer/requests" className="button button-outline">Clear filters</ClearFilters>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon"><Inbox size={21} /></div>
              <h3>No requests yet</h3>
              <p>Submitted creatives will appear here for review.</p>
            </div>
          )}
        </section>
      </PageContainer>
      <PageFooter />
    </>
  );
}
