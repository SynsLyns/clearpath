export const PRODUCTS = ["personal_loan", "credit_card", "mortgage"] as const;
export type Product = (typeof PRODUCTS)[number];

export const CHANNELS = ["affiliate", "email", "social", "search", "display"] as const;
export type Channel = (typeof CHANNELS)[number];

export const STATUSES = [
  "pending",
  "approved",
  "rejected",
  "changes_requested",
  "auto_cleared",
  "superseded",
  "archived",
] as const;
export type SubmissionStatus = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Changes requested",
  auto_cleared: "Auto-cleared",
  superseded: "Superseded",
  archived: "Archived",
};

export const SEVERITY_WEIGHTS = { high: 3, medium: 1 } as const;
export const RULE_VERSION = "v1";
export const SLA_HOURS = 24;
export const QA_SAMPLE_RATE = 0.1;

export const USERS = {
  submitter: "Jordan Lee (Marketing)",
  reviewer: "Priya Nair (Compliance)",
  secondReviewer: "Marcus Webb (Compliance)",
  system: "System",
} as const;

export const REASONS = {
  prohibited_claim: {
    label: "Prohibited claim",
    rules: [
      "guaranteed_approval",
      "guaranteed_claim",
      "no_credit_check",
      "free_money",
      "superlative_claim",
    ],
  },
  missing_disclosure: {
    label: "Missing disclosure",
    rules: [
      "apr_missing",
      "nmls_missing",
      "company_name_missing",
      "equal_housing_missing",
      "affiliate_disclosure_missing",
    ],
  },
  misleading_urgency: {
    label: "Misleading urgency",
    rules: ["urgency_manipulation"],
  },
  misleading_status: {
    label: "Misleading status",
    rules: ["prequal_approval_language"],
  },
  no_issues: { label: "No issues found", rules: [] },
  false_positive_flags: { label: "False-positive flags", rules: [] },
  other: { label: "Other", rules: [] },
} as const;

export type ReasonCode = keyof typeof REASONS;
export type ReviewDecision = "approved" | "rejected" | "changes_requested";
