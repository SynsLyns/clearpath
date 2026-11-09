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
  | "prequal_approval_language"
  | "superlative_claim"
  | "urgency_manipulation";

type Rule = {
  id: RuleId;
  severity: Severity;
  applies: (product: Product, channel: Channel) => boolean;
  pattern: RegExp;
  message: string;
  mode: "match" | "missing" | "apr";
};

export type RuleResult = {
  ruleId: RuleId;
  severity: Severity;
  passed: boolean;
  message: string;
  snippet: string;
};

export { RULE_VERSION };

export const RULES: readonly Rule[] = [
  {
    id: "guaranteed_approval",
    severity: "high",
    applies: () => true,
    pattern: /guaranteed\s+(approval|acceptance)/i,
    message: "Guaranteed approval claims are prohibited.",
    mode: "match",
  },
  {
    id: "guaranteed_claim",
    severity: "medium",
    applies: () => true,
    pattern: /\bguaranteed\b/i,
    message: "'Guaranteed' claims need substantiation.",
    mode: "match",
  },
  {
    id: "no_credit_check",
    severity: "high",
    applies: () => true,
    pattern: /no\s+credit\s+check/i,
    message: "'No credit check' is misleading for these products.",
    mode: "match",
  },
  {
    id: "free_money",
    severity: "high",
    applies: () => true,
    pattern: /(free\s+money|risk[-\s]?free)/i,
    message: "Misleading 'free'/'risk-free' claims.",
    mode: "match",
  },
  {
    id: "apr_missing",
    severity: "high",
    applies: () => true,
    pattern:
      /(\d+(\.\d+)?\s*%|as\s+low\s+as|\$\s?\d[\d,]*\s*(\/|per|a)\s*(mo|month))/i,
    message: "A stated rate or payment requires an APR disclosure.",
    mode: "apr",
  },
  {
    id: "nmls_missing",
    severity: "medium",
    applies: (product) => product === "mortgage" || product === "personal_loan",
    pattern: /NMLS\s*#?\s*\d+/i,
    message: "NMLS ID is required.",
    mode: "missing",
  },
  {
    id: "company_name_missing",
    severity: "medium",
    applies: () => true,
    pattern: /ClearPath Financial/i,
    message: "Company legal name is required.",
    mode: "missing",
  },
  {
    id: "equal_housing_missing",
    severity: "high",
    applies: (product) => product === "mortgage",
    pattern: /Equal Housing Lender/i,
    message: "Equal Housing Lender disclosure is required for mortgage products.",
    mode: "missing",
  },
  {
    id: "affiliate_disclosure_missing",
    severity: "medium",
    applies: (_product, channel) => channel === "affiliate",
    pattern:
      /(advertisement|sponsored|paid\s+(partner|partnership)|may\s+be\s+compensated|we\s+(may\s+)?(earn|receive)\s+(a\s+)?(commission|compensation))/i,
    message:
      "Affiliate creatives must clearly disclose the advertising relationship.",
    mode: "missing",
  },
  {
    id: "prequal_approval_language",
    severity: "medium",
    applies: (product) => product === "mortgage",
    pattern: /(pre-?approved|you(?:'|’)?re\s+approved|you\s+are\s+approved)/i,
    message: "Approval language is misleading for prequalification products.",
    mode: "match",
  },
  {
    id: "superlative_claim",
    severity: "medium",
    applies: () => true,
    pattern: /\b(lowest|best)\s+(rates?|apr)\b/i,
    message: "Superlative rate claims need substantiation.",
    mode: "match",
  },
  {
    id: "urgency_manipulation",
    severity: "medium",
    applies: () => true,
    pattern: /(act\s+now|only\s+\d+\s+left)/i,
    message: "Artificial urgency language is discouraged.",
    mode: "match",
  },
];

export function runRules(
  text: string,
  product: Product,
  channel: Channel,
): { checks: RuleResult[]; riskScore: number } {
  const checks: RuleResult[] = [];

  for (const rule of RULES) {
    if (!rule.applies(product, channel)) continue;

    const match = text.match(rule.pattern);
    const aprDisclosed = /\bAPR\b/i.test(text);
    const passed =
      rule.mode === "missing"
        ? match !== null
        : rule.mode === "apr"
          ? match === null || aprDisclosed
          : match === null;

    const snippet =
      rule.mode === "missing"
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
