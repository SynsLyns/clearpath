import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock3, Inbox, ShieldAlert } from "lucide-react";
import { PageContainer, PageFooter, PageHeading } from "@/components/app-shell";
import { QueryToast } from "@/components/query-toast";
import { ClearFilters } from "@/components/clear-filters";
import { ReviewerFilters } from "@/components/reviewer-filters";
import { RiskBadge, RuleAuthorityTag, StatusBadge } from "@/components/submission-details";
import { WaitingTime } from "@/components/time-ago";
import { statusLabel, titleCase } from "@/lib/format";
import { getAttachments, getPendingQueue, getRuleChecks, getSubmissions, isSlaBreached } from "@/lib/repository";
import { requireRole } from "@/lib/session";
import { CHANNELS, PRODUCTS } from "@/lib/constants";
import { getRiskLevel, getRuleAuthority } from "@/lib/rules";

export const dynamic = "force-dynamic";

export default async function ReviewerQueuePage({
  searchParams,
}: {
  searchParams: Promise<{
    decided?: string;
    at?: string;
    flagDismissed?: string;
    search?: string;
    product?: string;
    channel?: string;
    risk?: string;
    qa?: string;
  }>;
}) {
  await requireRole("reviewer");
  const [allSubmissions, checks, attachments, query] = await Promise.all([
    getSubmissions(),
    getRuleChecks(),
    getAttachments(),
    searchParams,
  ]);
  const pending = getPendingQueue(allSubmissions.filter((item) => item.status === "pending"));
  const checkGroups = new Map<string, typeof checks>();
  for (const check of checks) {
    const group = checkGroups.get(check.submissionId) ?? [];
    group.push(check);
    checkGroups.set(check.submissionId, group);
  }
  const search = query.search?.trim() ?? "";
  const product = PRODUCTS.find((value) => value === query.product);
  const channel = CHANNELS.find((value) => value === query.channel);
  const risk = ["high", "medium", "clean"].find((value) => value === query.risk);
  const qa = ["sample", "standard"].find((value) => value === query.qa);
  const hasFilters = Boolean(search || product || channel || risk || qa);
  const levelBySubmission = new Map(pending.map((item) => [
    item.id,
    getRiskLevel((checkGroups.get(item.id) ?? []).filter((check) => !check.dismissed)),
  ]));
  const countFor = (predicate: (item: (typeof pending)[number]) => boolean) =>
    pending.filter(predicate).length;
  const filterCounts = {
    products: Object.fromEntries(PRODUCTS.map((value) => [
      value,
      countFor((item) => item.product === value),
    ])),
    channels: Object.fromEntries(CHANNELS.map((value) => [
      value,
      countFor((item) => item.channel === value),
    ])),
    risks: Object.fromEntries(["high", "medium", "clean"].map((value) => [
      value,
      countFor((item) => levelBySubmission.get(item.id) === value),
    ])),
    qa: {
      sample: countFor((item) => item.qaSample),
      standard: countFor((item) => !item.qaSample),
    },
  };
  const attachmentCounts = new Map<string, number>();
  for (const attachment of attachments) {
    attachmentCounts.set(
      attachment.submissionId,
      (attachmentCounts.get(attachment.submissionId) ?? 0) + 1,
    );
  }
  const queue = pending.filter((item) => {
    return (
      (!search || item.partner.toLocaleLowerCase().includes(search.toLocaleLowerCase())) &&
      (!product || item.product === product) &&
      (!channel || item.channel === channel) &&
      (!risk || levelBySubmission.get(item.id) === risk) &&
      (!qa || (qa === "sample" ? item.qaSample : !item.qaSample))
    );
  });
  const breached = queue.filter((item) => isSlaBreached(item.createdAt)).length;
  const decidedAt = query.at ? new Date(query.at) : null;
  const decisionMessage = query.decided
    ? `${statusLabel(query.decided)}${decidedAt && !Number.isNaN(decidedAt.getTime()) ? `, logged at ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(decidedAt)}` : ""}.`
    : query.flagDismissed
      ? "Flag dismissed. Risk score updated."
      : undefined;
  const toastKey = query.decided ? "decided" : query.flagDismissed ? "flagDismissed" : undefined;

  return (
    <>
      <PageContainer>
        <QueryToast key={decisionMessage ?? "none"} message={decisionMessage} clearKey={toastKey} />
        <PageHeading
          eyebrow="Compliance workspace"
          title="Review queue"
          description="Work the most time-sensitive submissions first, with rule flags and context up front."
          action={<Link className="button button-outline" href="/analytics">View analytics <ArrowRight size={15} /></Link>}
        />
        <div className="reviewer-tabs" aria-label="Reviewer views">
          <Link className="reviewer-tab reviewer-tab-active" href="/reviewer" aria-current="page">Review queue</Link>
          <Link className="reviewer-tab" href="/reviewer/requests">All requests</Link>
        </div>
        <div className="queue-summary">
          <div className="queue-summary-copy">
            <div className="queue-summary-icon"><Inbox size={19} /></div>
            <div>
              <strong>{queue.length} {queue.length === 1 ? "submission" : "submissions"} awaiting review</strong>
              <span>{hasFilters ? `Showing filtered results from ${pending.length} pending submissions` : "Submissions with flags and QA samples"}</span>
            </div>
          </div>
          <div className="queue-summary-stats">
            <div><span className="summary-dot summary-dot-urgent" /> <strong>{breached}</strong> SLA breached</div>
            <div><Clock3 size={15} /> 24h service level</div>
          </div>
        </div>
        {pending.length > 0 && (
          <ReviewerFilters
            initialSearch={search}
            initialProduct={product ?? ""}
            initialChannel={channel ?? ""}
            initialRisk={risk ?? ""}
            initialQa={qa ?? ""}
            hasFilters={hasFilters}
            counts={filterCounts}
          />
        )}
        <div className="queue-list">
          {queue.length ? queue.map((submission, index) => {
            const rowChecks = (checkGroups.get(submission.id) ?? []).filter((check) => !check.passed && !check.dismissed);
            const topFlag = [...rowChecks].sort((a, b) => (a.severity === "high" ? -1 : 1) - (b.severity === "high" ? -1 : 1))[0];
            const breachedItem = isSlaBreached(submission.createdAt);
            return (
              <Link className={`queue-card ${breachedItem ? "queue-card-breached" : ""}`} href={`/reviewer/${submission.id}`} key={submission.id}>
                <div className="queue-rank">{String(index + 1).padStart(2, "0")}</div>
                <div className="queue-card-content">
                  <div className="queue-card-topline">
                    <div className="queue-title-group">
                      <h2>{submission.partner}</h2>
                      {submission.version > 1 && <span className="version-tag">v{submission.version}</span>}
                      {submission.qaSample && <span className="qa-tag">QA sample</span>}
                      {(attachmentCounts.get(submission.id) ?? 0) > 0 && (
                        <span className="attachment-count-tag">
                          {attachmentCounts.get(submission.id)} attachment{attachmentCounts.get(submission.id) === 1 ? "" : "s"}
                        </span>
                      )}
                      {breachedItem && <span className="sla-tag"><AlertTriangle size={12} /> SLA breached</span>}
                    </div>
                    <RiskBadge checks={checkGroups.get(submission.id) ?? []} riskScore={submission.riskScore} />
                  </div>
                  <div className="queue-metadata">
                    <span>{titleCase(submission.product)}</span><i />
                    <span>{titleCase(submission.channel)}</span><i />
                    <span>Submitted by {submission.submittedBy.split(" (")[0]}</span>
                  </div>
                  <div className="queue-card-bottom">
                    {topFlag ? (
                      <p className="queue-flag">
                        <ShieldAlert size={15} />
                        <span>
                          <b>{topFlag.ruleId}</b> {topFlag.message}{" "}
                          <RuleAuthorityTag authority={topFlag.authority ?? getRuleAuthority(topFlag.ruleId)} />
                        </span>
                      </p>
                    ) : (
                      <p className="queue-flag queue-flag-clean"><Clock3 size={15} /><span>Selected for a quality-assurance review</span></p>
                    )}
                    <span className="queue-wait">Waiting <WaitingTime date={submission.createdAt} /></span>
                  </div>
                </div>
                <ArrowRight className="queue-open" size={17} />
              </Link>
            );
          }) : (
            <div className="empty-state queue-empty">
              <div className="empty-icon empty-icon-green"><Inbox size={21} /></div>
              {hasFilters ? (
                <>
                  <h3>No matching submissions</h3>
                  <p>Try a different partner or campaign, product, channel, risk level, or review type.</p>
                  <ClearFilters action="/reviewer" className="button button-outline">Clear filters</ClearFilters>
                </>
              ) : (
                <>
                  <h3>You’re all caught up.</h3>
                  <p>New flagged creatives and quality samples will appear here.</p>
                  <span className="queue-clear-note"><StatusBadge status="auto_cleared" /> Clean creatives can clear automatically.</span>
                </>
              )}
            </div>
          )}
        </div>
      </PageContainer>
      <PageFooter />
    </>
  );
}
