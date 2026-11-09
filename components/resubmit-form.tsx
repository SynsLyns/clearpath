"use client";

import { useActionState, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { resubmit, type ActionState } from "@/app/actions";
import { runRules } from "@/lib/rules";

export function ResubmitForm({
  submissionId,
  initialCreative,
  product,
  channel,
}: {
  submissionId: string;
  initialCreative: string;
  product: string;
  channel: string;
}) {
  const action = resubmit.bind(null, submissionId);
  const [state, formAction, pending] = useActionState(action, {} satisfies ActionState);
  const [creative, setCreative] = useState(initialCreative);
  const checks = useMemo(
    () => runRules(creative, product as "personal_loan" | "credit_card" | "mortgage", channel as "affiliate" | "email" | "social" | "search" | "display").checks,
    [channel, creative, product],
  );
  const failures = checks.filter((check) => !check.passed);

  return (
    <form className="resubmit-form" action={formAction}>
      <label className="field">
        <span>Updated creative copy <b>*</b></span>
        <textarea name="creativeText" value={creative} onChange={(event) => setCreative(event.target.value)} rows={7} minLength={20} required maxLength={5000} />
      </label>
      <div className="resubmit-check">
        {failures.length ? (
          <>
            <strong><AlertCircle size={16} /> {failures.length} self-check {failures.length === 1 ? "flag" : "flags"} remain</strong>
            <ul>{failures.map((item) => <li key={item.ruleId}>{item.message}</li>)}</ul>
          </>
        ) : (
          <strong className="check-clear"><CheckCircle2 size={16} /> No rule flags. Eligible for auto-clear.</strong>
        )}
      </div>
      {state.error && <p className="form-error" role="alert"><AlertCircle size={16} />{state.error}</p>}
      <button className="button button-primary" disabled={pending}>{pending ? "Resubmitting…" : "Resubmit creative"}</button>
    </form>
  );
}
