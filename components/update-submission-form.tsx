"use client";

import { useActionState, useCallback, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { updateSubmission, type ActionState } from "@/app/actions";
import { AttachmentUploader } from "@/components/attachment-uploader";
import { InsertDisclosuresButton } from "@/components/insert-disclosures-button";
import { RuleAuthorityTag } from "@/components/submission-details";
import { CHANNELS, PRODUCTS, type Channel, type Product } from "@/lib/constants";
import { titleCase } from "@/lib/format";
import { runRules } from "@/lib/rules";

export function UpdateSubmissionForm({
  submission,
}: {
  submission: {
    id: string;
    partner: string;
    product: string;
    channel: string;
    creativeText: string;
    attachments: {
      id: string;
      kind: string;
      name: string;
      url: string;
      contentType: string | null;
      sizeBytes: number | null;
    }[];
  };
}) {
  const action = updateSubmission.bind(null, submission.id);
  const [state, formAction, pending] = useActionState(action, {} satisfies ActionState);
  const [partner, setPartner] = useState(submission.partner);
  const [product, setProduct] = useState<Product>(submission.product as Product);
  const [channel, setChannel] = useState<Channel>(submission.channel as Channel);
  const [creative, setCreative] = useState(submission.creativeText);
  const [attachmentNames, setAttachmentNames] = useState(() => submission.attachments.map((item) => item.name));
  const [uploadsReady, setUploadsReady] = useState(true);
  const onAttachmentsChange = useCallback((names: string[], ready: boolean) => {
    setAttachmentNames(names);
    setUploadsReady(ready);
  }, []);
  const checks = useMemo(
    () => runRules(creative, product, channel, attachmentNames.map((name) => ({ name })))
      .checks.filter((check) => !check.passed),
    [attachmentNames, channel, creative, product],
  );

  return (
    <form className="resubmit-form" action={formAction}>
      <label className="field">
        <span>Partner or campaign name <b>*</b></span>
        <input
          name="partner"
          value={partner}
          onChange={(event) => setPartner(event.currentTarget.value)}
          required
          maxLength={120}
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Financial product <b>*</b></span>
          <select name="product" value={product} onChange={(event) => setProduct(event.currentTarget.value as Product)}>
            {PRODUCTS.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Marketing channel <b>*</b></span>
          <select name="channel" value={channel} onChange={(event) => setChannel(event.currentTarget.value as Channel)}>
            {CHANNELS.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Updated creative copy {attachmentNames.length ? <small>(optional with an attachment)</small> : <b>*</b>}</span>
        <textarea
          name="creativeText"
          value={creative}
          onChange={(event) => setCreative(event.currentTarget.value)}
          rows={7}
          minLength={attachmentNames.length ? undefined : 20}
          required={attachmentNames.length === 0}
          maxLength={5000}
        />
        <span className="field-hint"><span>Include disclosures and footnotes exactly as they’ll appear.</span><span>{creative.length}/5,000</span></span>
      </label>
      <AttachmentUploader
        existingAttachments={submission.attachments}
        onChange={onAttachmentsChange}
      />
      <div className="resubmit-check">
        {checks.length ? (
          <>
            <strong><AlertCircle size={16} /> {checks.length} self-check {checks.length === 1 ? "flag" : "flags"} remain</strong>
            <ul>{checks.map((item) => (
              <li key={item.ruleId}>
                <span>{item.message}</span>
                <RuleAuthorityTag authority={item.authority} />
                <small className="rule-fix-hint">Suggested fix: {item.fix}</small>
              </li>
            ))}</ul>
            {checks.some((check) => [
              "nmls_missing",
              "company_name_missing",
              "equal_housing_missing",
              "affiliate_disclosure_missing",
              "testimonial_no_disclosure",
            ].includes(check.ruleId)) && (
              <InsertDisclosuresButton text={creative} onInsert={setCreative} />
            )}
          </>
        ) : (
          <strong className="check-clear"><CheckCircle2 size={16} /> No rule flags. Eligible for auto-clear.</strong>
        )}
      </div>
      {state.error && <p className="form-error" role="alert"><AlertCircle size={16} />{state.error}</p>}
      {attachmentNames.length > 0 && (
        <p className="attachment-self-check-note">
          Supported PDFs and images are screened for text after submission. Extraction may miss content, and every attachment still requires manual review.
        </p>
      )}
      <p className="form-privacy">Saving creates a new version. Previous versions and compliance decisions stay in the audit history.</p>
      <button className="button button-primary" disabled={pending || !uploadsReady}>
        {pending ? "Saving update…" : !uploadsReady ? "Waiting for uploads…" : "Save as new version"}
      </button>
    </form>
  );
}
