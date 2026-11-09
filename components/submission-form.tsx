"use client";

import { useActionState, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Info, Sparkles } from "lucide-react";
import { CHANNELS, PRODUCTS, type Channel, type Product } from "@/lib/constants";
import { titleCase } from "@/lib/format";
import { runRules, type RuleResult } from "@/lib/rules";
import { createSubmission, type ActionState } from "@/app/actions";

const initialState: ActionState = {};

function CheckGroup({
  title,
  checks,
  tone,
}: {
  title: string;
  checks: RuleResult[];
  tone: "high" | "medium";
}) {
  if (!checks.length) return null;
  return (
    <div className={`self-check-group self-check-${tone}`}>
      <h3>{title}<span>{checks.length}</span></h3>
      {checks.map((check) => (
        <div className="self-check-item" key={check.ruleId}>
          <AlertCircle size={15} />
          <div>
            <strong>{check.message}</strong>
            <small>{check.snippet}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SubmissionForm() {
  const [state, formAction, pending] = useActionState(createSubmission, initialState);
  const [product, setProduct] = useState<Product>("personal_loan");
  const [channel, setChannel] = useState<Channel>("affiliate");
  const [creative, setCreative] = useState("");

  const result = useMemo(
    () => runRules(creative, product, channel),
    [creative, product, channel],
  );
  const failures = result.checks.filter((check) => !check.passed);
  const high = failures.filter((check) => check.severity === "high");
  const medium = failures.filter((check) => check.severity === "medium");

  return (
    <div className="submit-layout">
      <form className="form-card" action={formAction}>
        <div className="form-card-heading">
          <span className="step-number">01</span>
          <div>
            <h2>Submission details</h2>
            <p>Tell us where this creative will appear.</p>
          </div>
        </div>
        <div className="form-fields">
          <label className="field">
            <span>Partner or campaign name <b>*</b></span>
            <input name="partner" placeholder="e.g. Northstar Media" required maxLength={120} />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Financial product <b>*</b></span>
              <select
                name="product"
                value={product}
                onChange={(event) => setProduct(event.target.value as Product)}
              >
                {PRODUCTS.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Marketing channel <b>*</b></span>
              <select
                name="channel"
                value={channel}
                onChange={(event) => setChannel(event.target.value as Channel)}
              >
                {CHANNELS.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Creative copy <b>*</b></span>
            <textarea
              name="creativeText"
              value={creative}
              onChange={(event) => setCreative(event.target.value)}
              placeholder="Paste the complete copy as it will appear to customers..."
              required
              minLength={20}
              rows={8}
              maxLength={5000}
            />
            <span className="field-hint">
              <span>Include disclosures and footnotes exactly as they’ll appear.</span>
              <span>{creative.length}/5,000</span>
            </span>
          </label>
          {state.error && <p className="form-error" role="alert"><AlertCircle size={16} />{state.error}</p>}
          <button className="button button-primary submit-button" disabled={pending}>
            {pending ? "Submitting…" : "Submit for compliance review"}
            {!pending && <Sparkles size={16} />}
          </button>
          <p className="form-privacy">Your submission and every compliance decision are recorded in the audit trail.</p>
        </div>
      </form>

      <aside className="self-check-card" aria-live="polite">
        <div className="self-check-heading">
          <span className="self-check-icon"><Sparkles size={17} /></span>
          <div><h2>Creative self-check</h2><p>Live checks · Rule set v1</p></div>
          <span className="live-indicator"><i /> Live</span>
        </div>
        <div className="self-check-content">
          {!creative.trim() ? (
            <div className="self-check-empty">
              <div className="self-check-empty-icon"><Info size={20} /></div>
              <strong>Start with your creative</strong>
              <p>We’ll check for common disclosure and claims issues as you type. This is a helpful first pass, not a substitute for review.</p>
            </div>
          ) : failures.length ? (
            <>
              <div className="self-check-summary">
                <strong>{high.length} high, {medium.length} medium flags</strong>
                <span>Fix these before submitting to avoid a longer review.</span>
              </div>
              <CheckGroup title="Needs attention" checks={high} tone="high" />
              <CheckGroup title="Review" checks={medium} tone="medium" />
            </>
          ) : (
            <div className="self-check-clear">
              <CheckCircle2 size={25} />
              <strong>No rule flags</strong>
              <p>Eligible for auto-clear. A small quality sample may still be reviewed by Compliance.</p>
            </div>
          )}
        </div>
        <div className="self-check-note">
          <Info size={15} />
          <span>Rules are illustrative. Compliance makes the final decision.</span>
        </div>
      </aside>
    </div>
  );
}
