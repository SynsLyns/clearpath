import assert from "node:assert/strict";
import { CHANNELS, PRODUCTS, type Channel, type Product } from "../lib/constants";
import { parseAttachmentPayload } from "../lib/attachments";
import { RULES, runRules } from "../lib/rules";

type Case = {
  name: string;
  text: string;
  product: Product;
  channel: Channel;
  attachments?: { name: string }[];
  failed: string[];
};

const cases: Case[] = [
  {
    name: "guaranteed approval suppresses the generic guaranteed flag",
    text: "Guaranteed approval today from ClearPath Financial.",
    product: "credit_card",
    channel: "email",
    failed: ["guaranteed_approval"],
  },
  {
    name: "bare guaranteed claim",
    text: "A guaranteed path with ClearPath Financial.",
    product: "credit_card",
    channel: "email",
    failed: ["guaranteed_claim"],
  },
  {
    name: "no credit check claim",
    text: "No credit check required. ClearPath Financial.",
    product: "credit_card",
    channel: "social",
    failed: ["no_credit_check"],
  },
  {
    name: "risk-free claim",
    text: "A risk-free opportunity from ClearPath Financial.",
    product: "credit_card",
    channel: "email",
    failed: ["free_money"],
  },
  {
    name: "APR is required when the ad states a rate",
    text: "Rates as low as 7.5% at ClearPath Financial.",
    product: "credit_card",
    channel: "search",
    failed: ["apr_missing"],
  },
  {
    name: "APR disclosure satisfies rate trigger",
    text: "Rates as low as 7.5% APR at ClearPath Financial.",
    product: "credit_card",
    channel: "search",
    failed: [],
  },
  {
    name: "100% online is not an APR rate trigger",
    text: "100% online at ClearPath Financial.",
    product: "credit_card",
    channel: "email",
    failed: [],
  },
  {
    name: "NMLS applies to personal loans",
    text: "Explore options from ClearPath Financial.",
    product: "personal_loan",
    channel: "email",
    failed: ["nmls_missing"],
  },
  {
    name: "NMLS does not apply to credit cards",
    text: "Explore options from ClearPath Financial.",
    product: "credit_card",
    channel: "email",
    failed: [],
  },
  {
    name: "missing company legal name",
    text: "Explore flexible borrowing options today.",
    product: "credit_card",
    channel: "display",
    failed: ["company_name_missing"],
  },
  {
    name: "mortgage equal housing disclosure",
    text: "Mortgage options from ClearPath Financial.",
    product: "mortgage",
    channel: "email",
    failed: ["nmls_missing", "equal_housing_missing"],
  },
  {
    name: "affiliate compensation disclosure",
    text: "Explore with ClearPath Financial. We may be compensated.",
    product: "credit_card",
    channel: "affiliate",
    failed: [],
  },
  {
    name: "prequalification approval language",
    text: "You’re pre-approved with ClearPath Financial and an Equal Housing Lender.",
    product: "mortgage",
    channel: "email",
    failed: ["nmls_missing", "prequal_approval_language"],
  },
  {
    name: "unsupported lowest rate claim",
    text: "Find the lowest rates at ClearPath Financial.",
    product: "credit_card",
    channel: "social",
    failed: ["superlative_claim"],
  },
  {
    name: "artificial urgency language",
    text: "Act now with ClearPath Financial.",
    product: "credit_card",
    channel: "email",
    failed: ["urgency_manipulation"],
  },
  {
    name: "undisclosed testimonial",
    text: "Real customers love ClearPath Financial. I saved $2,000 on interest.",
    product: "credit_card",
    channel: "social",
    failed: ["testimonial_no_disclosure"],
  },
  {
    name: "testimonial with results disclosure",
    text: "Real customers love ClearPath Financial. I saved $2,000 on interest. Results may vary.",
    product: "credit_card",
    channel: "social",
    failed: [],
  },
  {
    name: "reviewing an application is not a testimonial",
    text: "We'll review your application in minutes. ClearPath Financial.",
    product: "credit_card",
    channel: "email",
    failed: [],
  },
  {
    name: "a clean credit card creative",
    text: "ClearPath Financial offers flexible credit card options.",
    product: "credit_card",
    channel: "email",
    failed: [],
  },
  {
    name: "empty creative with an attachment skips text rules",
    text: "",
    product: "credit_card",
    channel: "social",
    attachments: [{ name: "ad.mp4" }],
    failed: ["manual_review_required"],
  },
  {
    name: "text creative with attachment still runs text rules",
    text: "ClearPath Financial credit card.",
    product: "credit_card",
    channel: "email",
    attachments: [{ name: "landing-page.html" }],
    failed: ["manual_review_required"],
  },
  {
    name: "same text without attachment has no flags",
    text: "ClearPath Financial credit card.",
    product: "credit_card",
    channel: "email",
    failed: [],
  },
];

for (const testCase of cases) {
  const result = runRules(testCase.text, testCase.product, testCase.channel, testCase.attachments);
  const failed = result.checks.filter((check) => !check.passed).map((check) => check.ruleId);
  assert.deepEqual(failed, testCase.failed, testCase.name);
  assert.deepEqual(
    runRules(testCase.text, testCase.product, testCase.channel, testCase.attachments),
    result,
    `${testCase.name}: repeat calls are deterministic`,
  );
  assert.equal(
    result.riskScore,
    result.checks.reduce(
      (score, check) => score + (check.passed ? 0 : check.severity === "high" ? 3 : 1),
      0,
    ),
    `${testCase.name}: risk score is weighted`,
  );
}

for (const rule of RULES) {
  assert.equal(rule.pattern.global, false, `${rule.id} must not use a stateful global regex`);
  assert.equal(rule.pattern.sticky, false, `${rule.id} must not use a stateful sticky regex`);
  assert.ok(rule.authority.trim(), `${rule.id} must have an authority label`);
  assert.ok(rule.fix.trim(), `${rule.id} must have a fix hint`);
}

const undisclosedTestimonial = runRules(
  "Real customers love ClearPath Financial. I saved $2,000 on interest.",
  "credit_card",
  "social",
);
assert.equal(
  undisclosedTestimonial.checks.find((check) => check.ruleId === "testimonial_no_disclosure")?.snippet,
  "Real customers",
);
const emptyWithAttachment = runRules("", "credit_card", "social", [{ name: "ad.mp4" }]);
assert.deepEqual(
  emptyWithAttachment.checks.filter((check) => !check.passed).map(({ ruleId, snippet }) => [ruleId, snippet]),
  [["manual_review_required", "ad.mp4"]],
);
assert.equal(emptyWithAttachment.riskScore, 1);
const validAttachments = parseAttachmentPayload(JSON.stringify([
  {
    kind: "file",
    name: "campaign.mp4",
    url: "https://store.private.blob.vercel-storage.com/campaign.mp4",
    contentType: "video/mp4",
    sizeBytes: 1024,
  },
  {
    kind: "link",
    name: "Landing page",
    url: "https://example.com/",
    contentType: null,
    sizeBytes: null,
  },
]));
assert.ok(validAttachments.ok);
if (!validAttachments.ok) {
  throw new Error("Valid attachment metadata was rejected.");
}
assert.equal(validAttachments.attachments.length, 2);

const ruleIds = new Set<string>();
for (const rule of RULES) {
  assert.ok(rule.title.trim(), `${rule.id} must have a title`);
  assert.ok(rule.description.trim(), `${rule.id} must have a description`);
  assert.ok(rule.rationale.trim(), `${rule.id} must have a rationale`);
  assert.ok(rule.fix.trim(), `${rule.id} must have a fix`);
  assert.ok(!ruleIds.has(rule.id), `${rule.id} must be unique`);
  ruleIds.add(rule.id);

  if (!rule.examples) continue;
  const { context, bad, good } = rule.examples;
  const failingCheck = runRules(bad, context.product, context.channel)
    .checks.find((check) => check.ruleId === rule.id);
  assert.equal(failingCheck?.passed, false, `${rule.id}: failing example must fail this rule`);
  const passingCheck = runRules(good, context.product, context.channel)
    .checks.find((check) => check.ruleId === rule.id);
  assert.equal(passingCheck?.passed, true, `${rule.id}: passing example must pass this rule`);
}

const blockedAttachment = parseAttachmentPayload(JSON.stringify([{
    kind: "file",
    name: "unsafe.exe",
    url: "https://store.private.blob.vercel-storage.com/unsafe.exe",
    contentType: null,
    sizeBytes: 1,
  }]));
assert.ok(!blockedAttachment.ok);
if (blockedAttachment.ok) throw new Error("Executable attachment was accepted.");
assert.match(blockedAttachment.error, /cannot be uploaded/);
const untrustedAttachmentHost = parseAttachmentPayload(JSON.stringify([{
    kind: "file",
    name: "image.png",
    url: "https://example.com/image.png",
    contentType: "image/png",
    sizeBytes: 1,
  }]));
assert.ok(!untrustedAttachmentHost.ok);
if (untrustedAttachmentHost.ok) throw new Error("Untrusted attachment host was accepted.");
assert.match(untrustedAttachmentHost.error, /Vercel Blob/);
const publicAttachment = parseAttachmentPayload(JSON.stringify([{
    kind: "file",
    name: "public-image.png",
    url: "https://store.public.blob.vercel-storage.com/image.png",
    contentType: "image/png",
    sizeBytes: 1,
  }]));
assert.ok(!publicAttachment.ok);
if (publicAttachment.ok) throw new Error("Public attachment URL was accepted.");
assert.match(publicAttachment.error, /private Vercel Blob/);

const absence = runRules("A short offer for your next chapter.", "personal_loan", "email")
  .checks.find((check) => check.ruleId === "company_name_missing");
assert.equal(absence?.snippet, "Not found in creative");

const aprFalsePositive = runRules("100% online at ClearPath Financial.", "credit_card", "email")
  .checks.find((check) => check.ruleId === "apr_missing");
assert.equal(aprFalsePositive?.passed, true, "The '100% online' phrase is not a stated rate");

assert.deepEqual(PRODUCTS, ["personal_loan", "credit_card", "mortgage"]);
assert.deepEqual(CHANNELS, ["affiliate", "email", "social", "search", "display"]);
console.log(
  `Passed ${cases.length} rule-engine cases, ${RULES.filter((rule) => rule.examples).length} rule examples, and configuration checks.`,
);
