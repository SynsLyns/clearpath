"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, ChevronRight, Minus, X } from "lucide-react";
import { decide, dismissFlag, type ActionState } from "@/app/actions";
import { REASONS, type ReviewDecision } from "@/lib/constants";
import { formatDate, statusLabel, titleCase } from "@/lib/format";
import { getRiskLevel, getRuleAuthority, getRuleFix } from "@/lib/rules";
import { TimeAgo } from "@/components/time-ago";
import type {
  AuditEventRecord,
  RuleCheckRecord,
  ReviewRecord,
} from "@/lib/repository";

const initialState: ActionState = {};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`status status-${status}`}>{statusLabel(status)}</span>;
}

export function RuleAuthorityTag({ authority }: { authority: string }) {
  return (
    <span
      className="rule-authority"
      title={`Rule inspired by ${authority}. Illustrative, not legal advice.`}
    >
      {authority}
    </span>
  );
}

function RuleFixHint({ ruleId }: { ruleId: string }) {
  const fix = getRuleFix(ruleId);
  return fix ? <small className="rule-fix-hint">Suggested fix: {fix}</small> : null;
}

export function RiskBadge({
  checks,
  riskScore,
}: {
  checks: readonly Pick<RuleCheckRecord, "severity" | "passed" | "dismissed">[];
  riskScore?: number;
}) {
  const level = getRiskLevel(checks.filter((check) => !check.dismissed));
  const label = level === "clean" ? "Clean" : `${titleCase(level)} risk`;
  return (
    <span className={`risk risk-${level}`}>
      <i aria-hidden="true" />
      {label}{riskScore && riskScore > 0 ? ` · ${riskScore}` : ""}
    </span>
  );
}

export function HighlightedCreative({
  text,
  checks,
}: {
  text: string;
  checks: readonly Pick<RuleCheckRecord, "snippet" | "passed" | "dismissed">[];
}) {
  const snippets = [...new Set(
    checks
      .filter((check) => !check.passed && !check.dismissed && check.snippet !== "Not found in creative")
      .map((check) => check.snippet.trim())
      .filter(Boolean),
  )].sort((a, b) => b.length - a.length);
  if (!snippets.length) return <p className="creative-copy">{text}</p>;

  const pattern = new RegExp(snippets.map(escapeRegExp).join("|"), "ig");
  const pieces: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index < cursor) continue;
    if (index > cursor) pieces.push(text.slice(cursor, index));
    pieces.push(<mark key={`${index}-${match[0]}`}>{match[0]}</mark>);
    cursor = index + match[0].length;
  }
  if (cursor < text.length) pieces.push(text.slice(cursor));
  return <p className="creative-copy">{pieces}</p>;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function AuditTrail({ events }: { events: readonly AuditEventRecord[] }) {
  if (!events.length) return <p className="muted-copy">No audit events yet.</p>;
  return (
    <ol className="audit-trail">
      {events.map((event) => (
        <li key={event.id}>
          <span className={`audit-marker audit-${event.action}`} />
          <div className="audit-copy">
            <p>{auditSentence(event)}</p>
            <span className="audit-time" title={formatDate(event.createdAt)}>
              <TimeAgo date={event.createdAt} />
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function auditSentence(event: AuditEventRecord) {
  const labels: Record<string, string> = {
    submitted: "Submitted",
    auto_cleared: "Auto-cleared",
    qa_sampled: "Selected for QA sample",
    flag_dismissed: "Flag dismissed",
    approved: "Approved",
    rejected: "Rejected",
    changes_requested: "Changes requested",
    resubmitted: "Resubmitted",
    superseded: "Superseded",
  };
  if (event.action === "submitted") return `Submitted by ${event.actor}. ${event.detail}`;
  if (event.action === "approved" || event.action === "rejected" || event.action === "changes_requested") {
    return `${labels[event.action]} by ${event.actor}. ${event.detail}`;
  }
  if (event.action === "resubmitted") return `Resubmitted by ${event.actor}. ${event.detail}`;
  return `${labels[event.action] ?? titleCase(event.action)} by ${event.actor}. ${event.detail}`;
}

export function FlagRows({
  checks,
  canDismiss = false,
  showFix = false,
}: {
  checks: readonly RuleCheckRecord[];
  canDismiss?: boolean;
  showFix?: boolean;
}) {
  const flagged = checks.filter((check) => !check.passed);
  if (!flagged.length) {
    return <p className="clean-message"><Check size={16} /> No rule failures were detected.</p>;
  }
  return (
    <div className="flag-list">
      {flagged.map((check) => (
        <article className={`flag-row ${check.dismissed ? "flag-dismissed" : ""}`} key={check.id}>
          <span className={`flag-severity flag-${check.severity}`} />
          <div className="flag-main">
            <div className="flag-title-row">
              <span className="rule-id">{check.ruleId}</span>
              <span className={`severity-label severity-${check.severity}`}>{check.severity}</span>
              {check.dismissed && <span className="dismissed-label">Dismissed</span>}
            </div>
            <div className="flag-message">
              <p>{check.message}</p>
              <RuleAuthorityTag authority={check.authority ?? getRuleAuthority(check.ruleId)} />
              <a className="rule-why-link" href={`/rules#rule-${check.ruleId}`} target="_blank" rel="noopener noreferrer">Why?</a>
            </div>
            {check.snippet && (
              <blockquote>{check.snippet === "Not found in creative" ? check.snippet : `“${check.snippet}”`}</blockquote>
            )}
            {showFix && <RuleFixHint ruleId={check.ruleId} />}
            {check.dismissed && check.dismissNote && (
              <small className="dismiss-note">Override by {check.dismissedBy}: {check.dismissNote}</small>
            )}
            {canDismiss && !check.dismissed && <DismissFlagForm ruleCheckId={check.id} />}
          </div>
        </article>
      ))}
    </div>
  );
}

function DismissFlagForm({ ruleCheckId }: { ruleCheckId: string }) {
  const [state, formAction, pending] = useActionState(dismissFlag, initialState);
  return (
    <form className="dismiss-form" action={formAction}>
      <input type="hidden" name="ruleCheckId" value={ruleCheckId} />
      <label className="sr-only" htmlFor={`dismiss-${ruleCheckId}`}>Reason for dismissing this flag</label>
      <input id={`dismiss-${ruleCheckId}`} name="note" placeholder="Why is this a false positive?" required minLength={3} />
      <button className="button button-quiet" disabled={pending}>{pending ? "Saving…" : "Dismiss flag"}</button>
      {state.error && <small className="inline-error">{state.error}</small>}
    </form>
  );
}

export function ReviewHistory({ reviews }: { reviews: readonly ReviewRecord[] }) {
  if (!reviews.length) return <p className="muted-copy">No compliance decision has been recorded.</p>;
  return (
    <div className="review-history">
      {reviews.map((review) => (
        <article className="review-history-item" key={review.id}>
          <div className="review-history-icon"><Check size={15} /></div>
          <div>
            <div className="review-history-title">
              <strong>{review.reviewer}</strong>
              <StatusBadge status={review.decision} />
            </div>
            <p>
              {review.reasonCode
                ? REASONS[review.reasonCode as keyof typeof REASONS]?.label ?? titleCase(review.reasonCode)
                : `Rule set ${review.ruleVersion}`}
            </p>
            {review.comment && <blockquote>{review.comment}</blockquote>}
            <small>{formatDate(review.createdAt)}</small>
          </div>
        </article>
      ))}
    </div>
  );
}

export function DecisionForm({
  submissionId,
  unresolvedHigh,
  autoDraftComment,
  nextHref,
  previousHref,
}: {
  submissionId: string;
  unresolvedHigh: number;
  autoDraftComment: string;
  nextHref?: string;
  previousHref?: string;
}) {
  const boundAction = decide.bind(null, submissionId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [decision, setDecision] = useState<ReviewDecision>("approved");
  const [comment, setComment] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const chooseDecision = useCallback((nextDecision: ReviewDecision) => {
    setDecision(nextDecision);
    setComment(nextDecision === "approved" ? "" : autoDraftComment);
  }, [autoDraftComment]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        formRef.current?.requestSubmit();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)
      )) return;

      const key = event.key.toLowerCase();
      const decisions: Record<string, ReviewDecision> = {
        a: "approved",
        c: "changes_requested",
        r: "rejected",
      };
      if (decisions[key]) {
        event.preventDefault();
        chooseDecision(decisions[key]);
      } else if (key === "j" && nextHref) {
        window.location.assign(nextHref);
      } else if (key === "k" && previousHref) {
        window.location.assign(previousHref);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chooseDecision, nextHref, previousHref]);

  return (
    <form ref={formRef} className="decision-form" action={formAction}>
      <div className="decision-choice-grid">
        {([
          ["approved", "Approve", Check, "decision-approve"],
          ["changes_requested", "Request changes", Minus, "decision-changes"],
          ["rejected", "Reject", X, "decision-reject"],
        ] as const).map(([value, label, Icon, className]) => (
          <button
            className={`decision-choice ${className} ${decision === value ? "selected" : ""}`}
            type="button"
            aria-pressed={decision === value}
            key={value}
            onClick={() => chooseDecision(value)}
          >
            <Icon size={16} />{label}
          </button>
        ))}
      </div>
      <input type="hidden" name="decision" value={decision} />
      {decision === "approved" && unresolvedHigh > 0 && (
        <p className="decision-warning">
          <AlertCircle size={16} /> Approving with {unresolvedHigh} unresolved high-severity {unresolvedHigh === 1 ? "flag" : "flags"} requires a comment.
        </p>
      )}
      <label className="field">
        <span>Decision reason {decision !== "approved" && <b>*</b>}</span>
        <select name="reasonCode" defaultValue="">
          <option value="">Select a reason</option>
          {Object.entries(REASONS)
            .filter(([code]) => decision === "approved" || (code !== "no_issues" && code !== "false_positive_flags"))
            .map(([code, reason]) => <option value={code} key={code}>{reason.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Reviewer comment {decision !== "approved" || unresolvedHigh > 0 ? <b>*</b> : null}</span>
        <textarea
          name="comment"
          rows={3}
          value={comment}
          onChange={(event) => setComment(event.currentTarget.value)}
          placeholder="Share context, next steps, or what needs to change..."
        />
      </label>
      {state.error && <p className="form-error" role="alert"><AlertCircle size={16} />{state.error}</p>}
      <button className="button button-primary decision-submit" disabled={pending}>
        {pending ? "Recording decision…" : "Record compliance decision"}
        <ChevronRight size={16} />
      </button>
      <p className="shortcut-hint">
        Shortcuts: <kbd>A</kbd> approve, <kbd>C</kbd> request changes, <kbd>R</kbd> reject, <kbd>J/K</kbd> next/prev · <kbd>⌘/Ctrl + Enter</kbd> submit
      </p>
    </form>
  );
}
