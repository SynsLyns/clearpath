import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock3, Inbox, ShieldAlert } from "lucide-react";
import { PageContainer, PageFooter, PageHeading } from "@/components/app-shell";
import { QueryToast } from "@/components/query-toast";
import { RiskBadge, StatusBadge } from "@/components/submission-details";
import { WaitingTime } from "@/components/time-ago";
import { statusLabel, titleCase } from "@/lib/format";
import { getPendingQueue, getRuleChecks, getSubmissions, isSlaBreached } from "@/lib/repository";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ReviewerQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ decided?: string; at?: string; flagDismissed?: string }>;
}) {
  await requireRole("reviewer");
  const [allSubmissions, checks, query] = await Promise.all([
    getSubmissions(),
    getRuleChecks(),
    searchParams,
  ]);
  const queue = getPendingQueue(allSubmissions.filter((item) => item.status === "pending"));
  const checkGroups = new Map<string, typeof checks>();
  for (const check of checks) {
    const group = checkGroups.get(check.submissionId) ?? [];
    group.push(check);
    checkGroups.set(check.submissionId, group);
  }
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
        <div className="queue-summary">
          <div className="queue-summary-copy">
            <div className="queue-summary-icon"><Inbox size={19} /></div>
            <div><strong>{queue.length} awaiting review</strong><span>Submissions with flags and QA samples</span></div>
          </div>
          <div className="queue-summary-stats">
            <div><span className="summary-dot summary-dot-urgent" /> <strong>{breached}</strong> SLA breached</div>
            <div><Clock3 size={15} /> 24h service level</div>
          </div>
        </div>
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
                        <span><b>{topFlag.ruleId}</b> {topFlag.message}</span>
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
              <h3>You’re all caught up.</h3>
              <p>New flagged creatives and quality samples will appear here.</p>
              <span className="queue-clear-note"><StatusBadge status="auto_cleared" /> Clean creatives can clear automatically.</span>
            </div>
          )}
        </div>
      </PageContainer>
      <PageFooter />
    </>
  );
}
