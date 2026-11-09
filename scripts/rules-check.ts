import assert from "node:assert/strict";
import { CHANNELS, PRODUCTS, type Channel, type Product } from "../lib/constants";
import { RULES, runRules } from "../lib/rules";

type Case = {
  name: string;
  text: string;
  product: Product;
  channel: Channel;
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
    name: "a clean credit card creative",
    text: "ClearPath Financial offers flexible credit card options.",
    product: "credit_card",
    channel: "email",
    failed: [],
  },
];

for (const testCase of cases) {
  const result = runRules(testCase.text, testCase.product, testCase.channel);
  const failed = result.checks.filter((check) => !check.passed).map((check) => check.ruleId);
  assert.deepEqual(failed, testCase.failed, testCase.name);
  assert.deepEqual(
    runRules(testCase.text, testCase.product, testCase.channel),
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
}

const absence = runRules("A short offer for your next chapter.", "personal_loan", "email")
  .checks.find((check) => check.ruleId === "company_name_missing");
assert.equal(absence?.snippet, "Not found in creative");

const aprFalsePositive = runRules("100% online at ClearPath Financial.", "credit_card", "email")
  .checks.find((check) => check.ruleId === "apr_missing");
assert.equal(aprFalsePositive?.passed, false, "The documented 100% online limitation remains visible");
assert.equal(aprFalsePositive?.snippet, "100%");

assert.deepEqual(PRODUCTS, ["personal_loan", "credit_card", "mortgage"]);
assert.deepEqual(CHANNELS, ["affiliate", "email", "social", "search", "display"]);
console.log(`Passed ${cases.length} rule-engine cases and configuration checks.`);
