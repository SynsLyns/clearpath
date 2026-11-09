import { db } from "../src/prisma/db";
import { RULE_VERSION, USERS } from "../lib/constants";
import type { AttachmentInput } from "../lib/attachments";
import { runRules, type RuleResult } from "../lib/rules";

type SeedCreative = {
  id: string;
  partner: string;
  product: "personal_loan" | "credit_card" | "mortgage";
  channel: "affiliate" | "email" | "social" | "search" | "display";
  creativeText: string;
  status: string;
  createdAt: Date;
  version?: number;
  parentId?: string | null;
  qaSample?: boolean;
  riskScore?: number;
  attachments?: AttachmentInput[];
};

const now = Date.now();
const hoursAgo = (hours: number) => new Date(now - hours * 3_600_000);
const daysAgo = (days: number, hours = 0) => new Date(now - (days * 24 + hours) * 3_600_000);
let seededSubmissionCount = 0;

function failuresFor(item: SeedCreative) {
  return runRules(item.creativeText, item.product, item.channel, item.attachments);
}

async function main() {
  await db.transaction(async (tx) => {
    await tx.orm.public.AuditEvent.where((event) => event.id.like("seed-%")).deleteAll();
    await tx.orm.public.Review.where((review) => review.id.like("seed-%")).deleteAll();
    await tx.orm.public.RuleCheck.where((check) => check.id.like("seed-%")).deleteAll();
    await tx.orm.public.Submission.where((submission) => submission.id.like("seed-%")).deleteAll();

    const seedItems: SeedCreative[] = [
      {
        id: "seed-pending-high",
        partner: "Brightline Partners",
        product: "personal_loan",
        channel: "affiliate",
        creativeText: "Guaranteed approval. No credit check. Act now. ClearPath Financial can help you move forward.",
        status: "pending",
        createdAt: hoursAgo(30),
      },
      {
        id: "seed-pending-medium",
        partner: "Harbor Home Network",
        product: "mortgage",
        channel: "search",
        creativeText: "You’re pre-approved with ClearPath Financial. Equal Housing Lender.",
        status: "pending",
        createdAt: hoursAgo(3),
      },
      {
        id: "seed-qa-sample",
        partner: "Northstar Card Campaign",
        product: "credit_card",
        channel: "social",
        creativeText: "ClearPath Financial offers flexible credit card options for everyday purchases.",
        status: "pending",
        createdAt: hoursAgo(1),
        qaSample: true,
      },
      {
        id: "seed-rework-v1",
        partner: "Evergreen Card Launch",
        product: "credit_card",
        channel: "email",
        creativeText: "Explore a flexible card for everyday purchases.",
        status: "superseded",
        createdAt: daysAgo(5),
        version: 1,
      },
      {
        id: "seed-rework-v2",
        partner: "Evergreen Card Launch",
        product: "credit_card",
        channel: "email",
        creativeText: "ClearPath Financial offers a flexible credit card for everyday purchases.",
        status: "approved",
        createdAt: daysAgo(4, 20),
        version: 2,
        parentId: "seed-rework-v1",
      },
      {
        id: "seed-rejected",
        partner: "Cedar Grove Lending",
        product: "personal_loan",
        channel: "display",
        creativeText: "Guaranteed approval with no credit check. ClearPath Financial. NMLS #246810.",
        status: "rejected",
        createdAt: daysAgo(2),
      },
      {
        id: "seed-auto-cleared",
        partner: "ClearPath Card Always-on",
        product: "credit_card",
        channel: "email",
        creativeText: "ClearPath Financial offers straightforward credit card options for your next purchase.",
        status: "auto_cleared",
        createdAt: daysAgo(1),
      },
      {
        id: "seed-testimonial",
        partner: "Summit Card Testimonials",
        product: "credit_card",
        channel: "social",
        creativeText: "Real customers love ClearPath Financial. I saved $2,000 on interest.",
        status: "pending",
        createdAt: hoursAgo(2),
      },
      {
        id: "seed-attachment-link",
        partner: "Sample Landing Page Review",
        product: "credit_card",
        channel: "social",
        creativeText: "",
        status: "pending",
        createdAt: hoursAgo(4),
        attachments: [{
          kind: "link",
          name: "Sample landing page",
          url: "https://example.com/",
          contentType: null,
          sizeBytes: null,
        }],
      },
    ];
    seededSubmissionCount = seedItems.length;

    for (const item of seedItems) {
      const { checks, riskScore } = failuresFor(item);
      const submission = await tx.orm.public.Submission.create({
        id: item.id,
        partner: item.partner,
        product: item.product,
        channel: item.channel,
        creativeText: item.creativeText,
        status: item.status,
        riskScore: item.riskScore ?? riskScore,
        ruleVersion: RULE_VERSION,
        submittedBy: USERS.submitter,
        qaSample: item.qaSample ?? false,
        version: item.version ?? 1,
        parentId: item.parentId ?? null,
        createdAt: item.createdAt,
      });

      for (const check of checks) {
        await tx.orm.public.RuleCheck.create({
          id: `seed-check-${item.id}-${check.ruleId}`,
          submissionId: submission.id,
          ruleId: check.ruleId,
          severity: check.severity,
          passed: check.passed,
          message: check.message,
          authority: check.authority,
          snippet: check.snippet,
        });
      }

      for (const attachment of item.attachments ?? []) {
        await tx.orm.public.Attachment.create({
          submissionId: submission.id,
          ...attachment,
        });
      }

      const summary = summarize(checks);
      await tx.orm.public.AuditEvent.create({
        id: `seed-event-${item.id}-submitted`,
        submissionId: item.id,
        actor: USERS.submitter,
        action: item.version === 2 ? "resubmitted" : "submitted",
        detail: `${item.version === 2 ? "Resubmitted" : "Auto-check"}: ${summary}; attachments: ${item.attachments?.length ?? 0}`,
        createdAt: item.createdAt,
      });
    }

    await tx.orm.public.AuditEvent.create({
      id: "seed-event-rework-v1-requested",
      submissionId: "seed-rework-v1",
      actor: USERS.secondReviewer,
      action: "changes_requested",
      detail: "Missing disclosure: Please include the ClearPath Financial legal name in the creative.",
      createdAt: daysAgo(4, 22),
    });
    await tx.orm.public.AuditEvent.create({
      id: "seed-event-qa-sampled",
      submissionId: "seed-qa-sample",
      actor: USERS.system,
      action: "qa_sampled",
      detail: "Selected for the 10% quality-assurance sample",
      createdAt: hoursAgo(1),
    });
    await tx.orm.public.Review.create({
      id: "seed-review-rework-v1",
      submissionId: "seed-rework-v1",
      reviewer: USERS.secondReviewer,
      decision: "changes_requested",
      reasonCode: "missing_disclosure",
      comment: "Please include the ClearPath Financial legal name in the creative.",
      ruleVersion: RULE_VERSION,
      createdAt: daysAgo(4, 22),
    });
    await tx.orm.public.AuditEvent.create({
      id: "seed-event-rework-v1-superseded",
      submissionId: "seed-rework-v1",
      actor: USERS.submitter,
      action: "superseded",
      detail: "Superseded by v2 after requested changes.",
      createdAt: daysAgo(4, 20),
    });
    await tx.orm.public.AuditEvent.create({
      id: "seed-event-rework-v2-approved",
      submissionId: "seed-rework-v2",
      actor: USERS.reviewer,
      action: "approved",
      detail: "No issues found. Rule set v1.",
      createdAt: daysAgo(4, 19),
    });
    await tx.orm.public.Review.create({
      id: "seed-review-rework-v2",
      submissionId: "seed-rework-v2",
      reviewer: USERS.reviewer,
      decision: "approved",
      reasonCode: "no_issues",
      comment: "Updated disclosure is present. Approved.",
      ruleVersion: RULE_VERSION,
      createdAt: daysAgo(4, 19),
    });
    await tx.orm.public.AuditEvent.create({
      id: "seed-event-rejected",
      submissionId: "seed-rejected",
      actor: USERS.reviewer,
      action: "rejected",
      detail: "Prohibited claim: Remove the guaranteed approval and no-credit-check claims.",
      createdAt: daysAgo(1, 23),
    });
    await tx.orm.public.Review.create({
      id: "seed-review-rejected",
      submissionId: "seed-rejected",
      reviewer: USERS.reviewer,
      decision: "rejected",
      reasonCode: "prohibited_claim",
      comment: "Remove the guaranteed approval and no-credit-check claims.",
      ruleVersion: RULE_VERSION,
      createdAt: daysAgo(1, 23),
    });
    await tx.orm.public.Review.create({
      id: "seed-review-auto-cleared",
      submissionId: "seed-auto-cleared",
      reviewer: USERS.system,
      decision: "auto_cleared",
      reasonCode: null,
      comment: `No rule failures under rule set ${RULE_VERSION}`,
      ruleVersion: RULE_VERSION,
      createdAt: daysAgo(1),
    });
    await tx.orm.public.AuditEvent.create({
      id: "seed-event-auto-cleared",
      submissionId: "seed-auto-cleared",
      actor: USERS.system,
      action: "auto_cleared",
      detail: `Auto-cleared under rule set ${RULE_VERSION}`,
      createdAt: daysAgo(1),
    });
  });

  console.log(`Seeded ${seededSubmissionCount} ClearPath compliance submissions and their review history.`);
}

function summarize(checks: readonly RuleResult[]) {
  const failed = checks.filter((check) => !check.passed);
  return `${failed.filter((check) => check.severity === "high").length} high, ${failed.filter((check) => check.severity === "medium").length} medium flags`;
}

async function run() {
  try {
    await main();
  } finally {
    await db.close();
  }
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
