import { ArrowDownRight, ArrowUpRight, BarChart3, Clock3, ShieldCheck } from "lucide-react";
import { PageContainer, PageFooter, PageHeading } from "@/components/app-shell";
import { formatDuration, titleCase } from "@/lib/format";
import { getPendingQueue, getReviews, getRuleChecks, getSubmissions, isSlaBreached } from "@/lib/repository";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  await requireRole("reviewer");
  const [submissions, checks, reviews] = await Promise.all([
    getSubmissions(),
    getRuleChecks(),
    getReviews(),
  ]);
  const activeSubmissions = submissions.filter((item) => item.status !== "archived");
  const activeIds = new Set(activeSubmissions.map((item) => item.id));
  const activeChecks = checks.filter((check) => activeIds.has(check.submissionId));
  const pending = getPendingQueue(activeSubmissions.filter((item) => item.status === "pending"));
  const reviewedTimes = activeSubmissions.flatMap((submission) => {
    const firstHumanReview = reviews
      .filter((review) => review.submissionId === submission.id && review.reviewer !== "System")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    return firstHumanReview
      ? [firstHumanReview.createdAt.getTime() - submission.createdAt.getTime()]
      : [];
  }).sort((a, b) => a - b);
  const median = reviewedTimes.length
    ? reviewedTimes.length % 2
      ? reviewedTimes[Math.floor(reviewedTimes.length / 2)]
      : (reviewedTimes[reviewedTimes.length / 2 - 1] + reviewedTimes[reviewedTimes.length / 2]) / 2
    : null;

  const reviewBySubmission = new Map<string, typeof reviews>();
  for (const review of reviews) {
    const group = reviewBySubmission.get(review.submissionId) ?? [];
    group.push(review);
    reviewBySubmission.set(review.submissionId, group);
  }
  const versionOnesWithDecision = activeSubmissions.filter((submission) =>
    submission.version === 1 && (reviewBySubmission.get(submission.id)?.length ?? 0) > 0,
  );
  const firstPassApproved = versionOnesWithDecision.filter((submission) => {
    const first = reviewBySubmission.get(submission.id)?.[0];
    return first?.decision === "approved" || first?.decision === "auto_cleared";
  }).length;
  const firstPassRate = versionOnesWithDecision.length
    ? firstPassApproved / versionOnesWithDecision.length
    : null;
  const autoCleared = activeSubmissions.filter((submission) => submission.status === "auto_cleared").length;
  const autoClearRate = activeSubmissions.length ? autoCleared / activeSubmissions.length : null;
  const breachedCount = pending.filter((submission) => isSlaBreached(submission.createdAt)).length;

  const failingRules = new Map<string, { count: number; message: string }>();
  for (const check of activeChecks) {
    if (check.passed || check.dismissed) continue;
    const current = failingRules.get(check.ruleId) ?? { count: 0, message: check.message };
    current.count += 1;
    failingRules.set(check.ruleId, current);
  }
  const topRules = [...failingRules.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);
  const empty = !activeSubmissions.length;

  return (
    <>
      <PageContainer>
        <PageHeading
          eyebrow="Compliance insights"
          title="Make the next review easier."
          description="A small set of operational signals to show where the review loop is moving."
        />
        <div className="analytics-grid">
          <MetricCard
            icon={<Clock3 size={17} />}
            label="Median time to decision"
            value={median === null ? "—" : formatDuration(median)}
            note={median === null ? "No human decisions yet" : `${reviewedTimes.length} human-reviewed submissions`}
            accent="blue"
          />
          <MetricCard
            icon={<ArrowUpRight size={17} />}
            label="First-pass approval"
            value={firstPassRate === null ? "—" : `${Math.round(firstPassRate * 100)}%`}
            note={versionOnesWithDecision.length ? `${firstPassApproved} of ${versionOnesWithDecision.length} version 1 decisions` : "No decisions yet"}
            accent="green"
          />
          <MetricCard
            icon={<ShieldCheck size={17} />}
            label="Auto-clear rate"
            value={autoClearRate === null ? "—" : `${Math.round(autoClearRate * 100)}%`}
            note={activeSubmissions.length ? `${autoCleared} of ${activeSubmissions.length} submissions` : "No submissions yet"}
            accent="mint"
          />
          <MetricCard
            icon={<BarChart3 size={17} />}
            label="Current queue"
            value={`${pending.length}`}
            note={`${breachedCount} SLA ${breachedCount === 1 ? "breach" : "breaches"} · 24h target`}
            accent="amber"
          />
        </div>

        <div className="analytics-lower">
          <section className="content-card top-rules-card">
            <div className="content-card-heading">
              <div><BarChart3 size={17} /><h2>Top failing rules</h2></div>
              <span>Non-dismissed flags</span>
            </div>
            {topRules.length ? (
              <div className="rule-bars">
                {topRules.map(([ruleId, data]) => {
                  const max = topRules[0]?.[1].count ?? 1;
                  return (
                    <div className="rule-bar-row" key={ruleId}>
                      <div className="rule-bar-label"><strong>{titleCase(ruleId)}</strong><span>{data.count}</span></div>
                      <div className="rule-bar-track"><span style={{ width: `${Math.max(8, (data.count / max) * 100)}%` }} /></div>
                      <p>{data.message}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="empty-inline">{empty ? "Not enough data yet" : "No unresolved rule flags."}</p>
            )}
          </section>
          <section className="content-card analytics-note-card">
            <div className="analytics-note-icon"><ArrowDownRight size={19} /></div>
            <h2>Keep clean creatives moving.</h2>
            <p>Self-checks can prevent repeat misses. Auto-clear lets clean work skip the queue, while the QA sample keeps a human quality signal in the loop.</p>
            <div className="analytics-queue-note">
              <span>Queue health</span><strong>{pending.length ? `${pending.length} awaiting` : "All clear"}</strong>
              <span className="queue-health-track"><i style={{ width: `${pending.length ? Math.max(12, (breachedCount / pending.length) * 100) : 0}%` }} /></span>
              <small>{breachedCount} past the assumed 24-hour SLA</small>
            </div>
          </section>
        </div>
        <p className="analytics-footnote">Figures are computed from seeded demo data plus live workspace activity. They are directional examples, not business-performance claims.</p>
      </PageContainer>
      <PageFooter />
    </>
  );
}

function MetricCard({
  icon,
  label,
  value,
  note,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  accent: "blue" | "green" | "mint" | "amber";
}) {
  return (
    <article className={`metric-card metric-${accent}`}>
      <div className="metric-card-top"><span className="metric-icon">{icon}</span><span className="metric-label">{label}</span></div>
      <strong className="metric-value">{value}</strong>
      <span className="metric-note">{note}</span>
    </article>
  );
}
