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

type Rule = {
  id: RuleId;
  severity: Severity;
  authority: string;
  fix: string;
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
    severity: "high",
    authority: "UDAAP (deceptive promise)",
    fix: "Remove the guaranteed-approval promise or replace it with accurate, supportable eligibility language.",
    applies: () => true,
    pattern: /guaranteed\s+(approval|acceptance)/i,
    message: "Guaranteed approval claims are prohibited.",
    mode: "match",
  },
  {
    id: "guaranteed_claim",
    severity: "medium",
    authority: "UDAAP (unsubstantiated claim)",
    fix: "Substantiate the claim with evidence or remove the unsupported guarantee.",
    applies: () => true,
    pattern: /\bguaranteed\b/i,
    message: "'Guaranteed' claims need substantiation.",
    mode: "match",
  },
  {
    id: "no_credit_check",
    severity: "high",
    authority: "UDAAP (misleading claim)",
    fix: "Remove the no-credit-check claim or describe the actual credit review accurately.",
    applies: () => true,
    pattern: /no\s+credit\s+check/i,
    message: "'No credit check' is misleading for these products.",
    mode: "match",
  },
  {
    id: "free_money",
    severity: "high",
    authority: "UDAAP (misleading claim)",
    fix: "Remove the free-money or risk-free claim and describe the offer's actual terms.",
    applies: () => true,
    pattern: /(free\s+money|risk[-\s]?free)/i,
    message: "Misleading 'free'/'risk-free' claims.",
    mode: "match",
  },
  {
    id: "apr_missing",
    severity: "high",
    authority: "Reg Z (TILA advertising)",
    fix: "Add the APR next to the stated rate or payment, e.g. 5.9% APR.",
    applies: () => true,
    pattern:
      /(\d+(\.\d+)?\s*%|as\s+low\s+as|\$\s?\d[\d,]*\s*(\/|per|a)\s*(mo|month))/i,
    message: "A stated rate or payment requires an APR disclosure.",
    mode: "apr",
  },
  {
    id: "nmls_missing",
    severity: "medium",
    authority: "SAFE Act / state licensing norms",
    fix: "Add the applicable NMLS ID for the mortgage or personal-loan advertiser.",
    applies: (product) => product === "mortgage" || product === "personal_loan",
    pattern: /NMLS\s*#?\s*\d+/i,
    message: "NMLS ID is required.",
    mode: "missing",
  },
  {
    id: "company_name_missing",
    severity: "medium",
    authority: "Company policy",
    fix: "Add the company's legal name, ClearPath Financial.",
    applies: () => true,
    pattern: /ClearPath Financial/i,
    message: "Company legal name is required.",
    mode: "missing",
  },
  {
    id: "equal_housing_missing",
    severity: "high",
    authority: "Fair Housing advertising",
    fix: "Add the Equal Housing Lender disclosure to the mortgage creative.",
    applies: (product) => product === "mortgage",
    pattern: /Equal Housing Lender/i,
    message: "Equal Housing Lender disclosure is required for mortgage products.",
    mode: "missing",
  },
  {
    id: "affiliate_disclosure_missing",
    severity: "medium",
    authority: "FTC Endorsement Guides",
    fix: "Clearly disclose the advertising relationship or possible compensation.",
    applies: (_product, channel) => channel === "affiliate",
    pattern:
      /(advertisement|sponsored|paid\s+(partner|partnership)|may\s+be\s+compensated|we\s+(may\s+)?(earn|receive)\s+(a\s+)?(commission|compensation))/i,
    message:
      "Affiliate creatives must clearly disclose the advertising relationship.",
    mode: "missing",
  },
  {
    id: "testimonial_no_disclosure",
    severity: "medium",
    authority: "FTC Endorsement Guides",
    fix: "Disclose any material connection and that results are not typical.",
    applies: () => true,
    pattern: /(testimonial|customer\s+stor(y|ies)|real\s+customers?|\bI\s+(saved|paid\s+off|consolidated|lowered|got\s+approved)\b)/i,
    message: "Testimonial detected: disclose any material connection and that results are not typical.",
    mode: "testimonial",
  },
  {
    id: "prequal_approval_language",
    severity: "medium",
    authority: "UDAAP (misleading status claim)",
    fix: "Replace approval language with accurate prequalification or application-status wording.",
    applies: (product) => product === "mortgage",
    pattern: /(pre-?approved|you(?:'|’)?re\s+approved|you\s+are\s+approved)/i,
    message: "Approval language is misleading for prequalification products.",
    mode: "match",
  },
  {
    id: "superlative_claim",
    severity: "medium",
    authority: "UDAAP (unsubstantiated claim)",
    fix: "Substantiate the comparative rate claim or remove the superlative.",
    applies: () => true,
    pattern: /\b(lowest|best)\s+(rates?|apr)\b/i,
    message: "Superlative rate claims need substantiation.",
    mode: "match",
  },
  {
    id: "urgency_manipulation",
    severity: "medium",
    authority: "UDAAP (pressure tactics)",
    fix: "Remove artificial scarcity or urgency unless it is accurate and supportable.",
    applies: () => true,
    pattern: /(act\s+now|only\s+\d+\s+left)/i,
    message: "Artificial urgency language is discouraged.",
    mode: "match",
  },
  {
    id: "manual_review_required",
    severity: "medium",
    authority: "Company policy",
    fix: "Have Compliance review each attachment; automated checks cannot read it yet.",
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
