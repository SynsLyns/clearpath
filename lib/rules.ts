import { RULE_VERSION, SEVERITY_WEIGHTS, type Channel, type Product } from "./constants";

export type Severity = keyof typeof SEVERITY_WEIGHTS;
export type RuleId =
  | "guaranteed_approval"
  | "guaranteed_claim"
  | "no_credit_check"
  | "free_money"
  | "apr_missing"
  | "nmls_missing"
  | "company_name_missing"
  | "equal_housing_missing"
  | "affiliate_disclosure_missing"
  | "testimonial_no_disclosure"
  | "prequal_approval_language"
  | "superlative_claim"
  | "urgency_manipulation"
  | "manual_review_required";

type RuleExample = {
  context: { product: Product; channel: Channel };
  bad: string;
  good: string;
};

type Rule = {
  id: RuleId;
  title: string;
  description: string;
  rationale: string;
  severity: Severity;
  authority: string;
  fix: string;
  examples?: RuleExample;
  applies: (product: Product, channel: Channel, attachments: readonly RuleAttachment[]) => boolean;
  pattern: RegExp;
  message: string;
  mode: "match" | "missing" | "apr" | "testimonial" | "manual";
};

export type RuleAttachment = { name: string };

export type RuleResult = {
  ruleId: RuleId;
  severity: Severity;
  passed: boolean;
  message: string;
  authority: string;
  fix: string;
  snippet: string;
};

export { RULE_VERSION };

export const RULES: readonly Rule[] = [
  {
    id: "guaranteed_approval",
    title: "Guaranteed approval claim",
    description: "The creative says 'guaranteed approval' or 'guaranteed acceptance'.",
    rationale: "Nobody can promise approval before underwriting, so the claim deceives consumers.",
    severity: "high",
    authority: "UDAAP (deceptive promise)",
    fix: "Remove the promise. Say 'Apply to see if you qualify.'",
    examples: {
      context: { product: "credit_card", channel: "email" },
      bad: "Guaranteed approval for every applicant!",
      good: "Apply to see if you qualify.",
    },
    applies: () => true,
    pattern: /guaranteed\s+(approval|acceptance)/i,
    message: "Guaranteed approval claims are prohibited.",
    mode: "match",
  },
  {
    id: "guaranteed_claim",
    title: "Unsubstantiated 'guaranteed' claim",
    description: "The word 'guaranteed' appears outside an approval claim.",
    rationale: "A guarantee has to say exactly what is guaranteed and be backed up.",
    severity: "medium",
    authority: "UDAAP (unsubstantiated claim)",
    fix: "State what is guaranteed and where the terms are, or remove it.",
    examples: {
      context: { product: "credit_card", channel: "email" },
      bad: "Guaranteed rates for life.",
      good: "Rates for qualified borrowers.",
    },
    applies: () => true,
    pattern: /\bguaranteed\b/i,
    message: "'Guaranteed' claims need substantiation.",
    mode: "match",
  },
  {
    id: "no_credit_check",
    title: "'No credit check' claim",
    description: "The creative says 'no credit check'.",
    rationale: "ClearPath reviews credit as part of its decision, so the claim is misleading.",
    severity: "high",
    authority: "UDAAP (misleading claim)",
    fix: "Remove it. If the prequalification uses a soft inquiry, say that instead.",
    examples: {
      context: { product: "personal_loan", channel: "email" },
      bad: "Get a loan with no credit check.",
      good: "Check your options with a soft credit inquiry.",
    },
    applies: () => true,
    pattern: /no\s+credit\s+check/i,
    message: "'No credit check' is misleading for these products.",
    mode: "match",
  },
  {
    id: "free_money",
    title: "Misleading 'free' or 'risk-free' claim",
    description: "The creative says 'free money' or 'risk-free'.",
    rationale: "Credit products cost money and carry risk.",
    severity: "high",
    authority: "UDAAP (misleading claim)",
    fix: "Remove it and describe the real rates and terms.",
    examples: {
      context: { product: "personal_loan", channel: "email" },
      bad: "Risk-free cash today!",
      good: "Review the rates and terms before you decide.",
    },
    applies: () => true,
    pattern: /(free\s+money|risk[-\s]?free)/i,
    message: "Misleading 'free'/'risk-free' claims.",
    mode: "match",
  },
  {
    id: "apr_missing",
    title: "Rate or payment stated without APR",
    description: "A rate, 'as low as' figure, or monthly payment appears and the creative does not mention APR.",
    rationale: "Stating a rate or payment calls for the APR to appear with it.",
    severity: "high",
    authority: "Reg Z (TILA advertising)",
    fix: "Add the APR next to the figure, for example '5.9% APR'.",
    examples: {
      context: { product: "credit_card", channel: "email" },
      bad: "Rates as low as 5.9% from ClearPath Financial.",
      good: "Rates as low as 5.9% APR from ClearPath Financial.",
    },
    applies: () => true,
    pattern:
      /(\d+(\.\d+)?\s*%|as\s+low\s+as|\$\s?\d[\d,]*\s*(\/|per|a)\s*(mo|month))/i,
    message: "A stated rate or payment requires an APR disclosure.",
    mode: "apr",
  },
  {
    id: "nmls_missing",
    title: "NMLS ID missing",
    description: "Mortgage and personal loan creatives do not show an NMLS ID.",
    rationale: "Lender advertising for these products commonly carries the company's NMLS ID.",
    severity: "medium",
    authority: "SAFE Act / state licensing norms",
    fix: "Add 'NMLS #' and the ID.",
    examples: {
      context: { product: "personal_loan", channel: "email" },
      bad: "ClearPath Financial personal loans.",
      good: "ClearPath Financial NMLS #123456 personal loans.",
    },
    applies: (product) => product === "mortgage" || product === "personal_loan",
    pattern: /NMLS\s*#?\s*\d+/i,
    message: "NMLS ID is required.",
    mode: "missing",
  },
  {
    id: "company_name_missing",
    title: "Company name missing",
    description: "The creative does not say 'ClearPath Financial'.",
    rationale: "Consumers should be able to tell who is advertising to them.",
    severity: "medium",
    authority: "Company policy",
    fix: "Include 'ClearPath Financial'.",
    examples: {
      context: { product: "credit_card", channel: "email" },
      bad: "Great rates on credit cards.",
      good: "Great rates on credit cards from ClearPath Financial.",
    },
    applies: () => true,
    pattern: /ClearPath Financial/i,
    message: "Company legal name is required.",
    mode: "missing",
  },
  {
    id: "equal_housing_missing",
    title: "Equal Housing Lender statement missing",
    description: "A mortgage creative does not say 'Equal Housing Lender'.",
    rationale: "Mortgage advertising is expected to carry the fair housing statement.",
    severity: "high",
    authority: "Fair Housing advertising",
    fix: "Add 'Equal Housing Lender'.",
    examples: {
      context: { product: "mortgage", channel: "email" },
      bad: "ClearPath Financial mortgage prequalification. NMLS #123456.",
      good: "ClearPath Financial mortgage prequalification. NMLS #123456. Equal Housing Lender.",
    },
    applies: (product) => product === "mortgage",
    pattern: /Equal Housing Lender/i,
    message: "Equal Housing Lender disclosure is required for mortgage products.",
    mode: "missing",
  },
  {
    id: "affiliate_disclosure_missing",
    title: "Affiliate disclosure missing",
    description: "An affiliate-channel creative has no sign that it is advertising or paid.",
    rationale: "Readers should be able to tell a paid promotion from independent advice.",
    severity: "medium",
    authority: "FTC Endorsement Guides",
    fix: "Add 'Advertisement' or 'We may be compensated if you apply.'",
    examples: {
      context: { product: "personal_loan", channel: "affiliate" },
      bad: "Our top pick for personal loans: ClearPath Financial.",
      good: "Advertisement. Our top pick for personal loans: ClearPath Financial.",
    },
    applies: (_product, channel) => channel === "affiliate",
    pattern:
      /(advertisement|sponsored|paid\s+(partner|partnership)|may\s+be\s+compensated|we\s+(may\s+)?(earn|receive)\s+(a\s+)?(commission|compensation))/i,
    message:
      "Affiliate creatives must clearly disclose the advertising relationship.",
    mode: "missing",
  },
  {
    id: "testimonial_no_disclosure",
    title: "Testimonial without disclosure",
    description: "The creative has a testimonial-style phrase and no 'results may vary' or compensation note.",
    rationale: "Customer stories imply typical results, and endorsements need their connections disclosed.",
    severity: "medium",
    authority: "FTC Endorsement Guides",
    fix: "Add 'Results may vary' and any compensation disclosure.",
    examples: {
      context: { product: "credit_card", channel: "social" },
      bad: "Real customers love ClearPath Financial.",
      good: "Real customers love ClearPath Financial. Results may vary.",
    },
    applies: () => true,
    pattern: /(testimonial|customer\s+stor(y|ies)|real\s+customers?|\bI\s+(saved|paid\s+off|consolidated|lowered|got\s+approved)\b)/i,
    message: "Testimonial detected: disclose any material connection and that results are not typical.",
    mode: "testimonial",
  },
  {
    id: "prequal_approval_language",
    title: "Approval wording on a prequalification product",
    description: "A mortgage creative says 'pre-approved' or 'you're approved'.",
    rationale: "Prequalification is not an approval, so this wording misleads.",
    severity: "medium",
    authority: "UDAAP (misleading status claim)",
    fix: "Use 'prequalify' wording.",
    examples: {
      context: { product: "mortgage", channel: "email" },
      bad: "You're pre-approved for a mortgage!",
      good: "See if you prequalify for a mortgage.",
    },
    applies: (product) => product === "mortgage",
    pattern: /(pre-?approved|you(?:'|’)?re\s+approved|you\s+are\s+approved)/i,
    message: "Approval language is misleading for prequalification products.",
    mode: "match",
  },
  {
    id: "superlative_claim",
    title: "Superlative rate claim",
    description: "The creative says 'lowest rate' or 'best rate'.",
    rationale: "Superlatives need substantiation.",
    severity: "medium",
    authority: "UDAAP (unsubstantiated claim)",
    fix: "Remove it, or cite the comparison and its source.",
    examples: {
      context: { product: "personal_loan", channel: "email" },
      bad: "Get the lowest rates on loans.",
      good: "Competitive rates for qualified borrowers.",
    },
    applies: () => true,
    pattern: /\b(lowest|best)\s+(rates?|apr)\b/i,
    message: "Superlative rate claims need substantiation.",
    mode: "match",
  },
  {
    id: "urgency_manipulation",
    title: "Artificial urgency",
    description: "The creative says 'act now' or 'only N left'.",
    rationale: "Pressure tactics can push people into credit decisions.",
    severity: "medium",
    authority: "UDAAP (pressure tactics)",
    fix: "Remove the pressure. If an offer really ends, state the date and terms.",
    examples: {
      context: { product: "credit_card", channel: "email" },
      bad: "Act now! Offer ends soon.",
      good: "Apply when you are ready.",
    },
    applies: () => true,
    pattern: /(act\s+now|only\s+\d+\s+left)/i,
    message: "Artificial urgency language is discouraged.",
    mode: "match",
  },
  {
    id: "manual_review_required",
    title: "Attachment needs manual review",
    description: "The submission includes an attachment.",
    rationale: "Automated checks cannot read this file type yet.",
    severity: "medium",
    authority: "Company policy",
    fix: "Nothing required; adding the text of the creative speeds up review.",
    applies: (_product, _channel, attachments) => attachments.length > 0,
    pattern: /$^/,
    message: "Attachment requires manual review: automated checks cannot read this file type yet.",
    mode: "manual",
  },
];

export function getRuleAuthority(ruleId: string) {
  return RULES.find((rule) => rule.id === ruleId)?.authority ?? "Company policy";
}

export function getRuleFix(ruleId: string) {
  return RULES.find((rule) => rule.id === ruleId)?.fix;
}

export function runRules(
  text: string,
  product: Product,
  channel: Channel,
  attachments: readonly RuleAttachment[] = [],
): { checks: RuleResult[]; riskScore: number } {
  const checks: RuleResult[] = [];

  for (const rule of RULES) {
    if (!rule.applies(product, channel, attachments)) continue;
    if (rule.mode !== "manual" && attachments.length > 0 && !text.trim()) continue;

    const match = text.match(rule.pattern);
    const aprDisclosed = /\bAPR\b/i.test(text);
    const testimonialDisclosure =
      /(results\s+(may\s+)?vary|not\s+typical|typical\s+results|compensated|paid\s+(testimonial|endorsement)|sponsored|advertisement|#ad\b)/i.test(text);
    const passed = rule.mode === "manual"
      ? false
      : rule.mode === "missing"
        ? match !== null
        : rule.mode === "apr"
          ? match === null || aprDisclosed
          : rule.mode === "testimonial"
            ? match === null || testimonialDisclosure
            : match === null;

    const snippet =
      rule.mode === "manual"
        ? attachments.map((attachment) => attachment.name).join(", ")
        : rule.mode === "missing"
        ? match?.[0] ?? "Not found in creative"
        : rule.mode === "apr"
          ? passed
            ? ""
            : match?.[0] ?? ""
          : passed
            ? ""
            : match?.[0] ?? "";

    checks.push({
      ruleId: rule.id,
      severity: rule.severity,
      passed,
      message: rule.message,
      authority: rule.authority,
      fix: rule.fix,
      snippet,
    });
  }

  if (
    checks.some((check) => check.ruleId === "guaranteed_approval" && !check.passed)
  ) {
    const generic = checks.find((check) => check.ruleId === "guaranteed_claim");
    if (generic) {
      generic.passed = true;
      generic.snippet = "";
    }
  }

  const riskScore = checks.reduce(
    (score, check) =>
      check.passed ? score : score + SEVERITY_WEIGHTS[check.severity],
    0,
  );
  return { checks, riskScore };
}

export function getRiskLevel(
  checks: readonly { severity: string; passed: boolean }[],
): "high" | "medium" | "clean" {
  if (checks.some((check) => !check.passed && check.severity === "high")) {
    return "high";
  }
  if (checks.some((check) => !check.passed)) return "medium";
  return "clean";
}
