"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  CHANNELS,
  PRODUCTS,
  QA_SAMPLE_RATE,
  REASONS,
  RULE_VERSION,
  USERS,
  type Channel,
  type Product,
  type ReasonCode,
} from "@/lib/constants";
import { assertRole } from "@/lib/session";
import { db } from "@/src/prisma/db";
import { runRules, type RuleResult } from "@/lib/rules";

export type ActionState = { error?: string };

export async function chooseRole(formData: FormData) {
  const role = formData.get("role");
  if (role !== "submitter" && role !== "reviewer") {
    throw new Error("Choose a valid demo role.");
  }
  (await cookies()).set("clearpath_role", role, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(role === "reviewer" ? "/reviewer" : "/submissions");
}

function summarizeFlags(checks: readonly RuleResult[]) {
  const failures = checks.filter((check) => !check.passed);
  const high = failures.filter((check) => check.severity === "high").length;
  const medium = failures.filter((check) => check.severity === "medium").length;
  return { failures, high, medium, detail: `${high} high, ${medium} medium flags` };
}

function initialRoute(failures: readonly RuleResult[]) {
  if (failures.length > 0) return { status: "pending", qaSample: false };
  if (Math.random() < QA_SAMPLE_RATE) return { status: "pending", qaSample: true };
  return { status: "auto_cleared", qaSample: false };
}

async function writeChecks(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  submissionId: string,
  checks: readonly RuleResult[],
) {
  for (const check of checks) {
    await tx.orm.public.RuleCheck.create({
      submissionId,
      ruleId: check.ruleId,
      severity: check.severity,
      passed: check.passed,
      message: check.message,
      snippet: check.snippet,
    });
  }
}

export async function createSubmission(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await assertRole("submitter");
  const partner = String(formData.get("partner") ?? "").trim();
  const product = String(formData.get("product") ?? "");
  const channel = String(formData.get("channel") ?? "");
  const creativeText = String(formData.get("creativeText") ?? "").trim();

  if (!partner) return { error: "Enter the partner or campaign name." };
  if (!PRODUCTS.includes(product as Product)) {
    return { error: "Choose a valid financial product." };
  }
  if (!CHANNELS.includes(channel as Channel)) {
    return { error: "Choose a valid marketing channel." };
  }
  if (creativeText.length < 20) {
    return { error: "Creative must be at least 20 characters." };
  }

  const result = runRules(creativeText, product as Product, channel as Channel);
  const { failures, detail } = summarizeFlags(result.checks);
  const routing = initialRoute(failures);

  await db.transaction(async (tx) => {
    const submission = await tx.orm.public.Submission.create({
      partner,
      product,
      channel,
      creativeText,
      status: routing.status,
      riskScore: result.riskScore,
      ruleVersion: RULE_VERSION,
      submittedBy: session.actor,
      qaSample: routing.qaSample,
      version: 1,
      parentId: null,
    });
    await writeChecks(tx, submission.id, result.checks);
    await tx.orm.public.AuditEvent.create({
      submissionId: submission.id,
      actor: session.actor,
      action: "submitted",
      detail: `Auto-check: ${detail}`,
    });

    if (routing.status === "auto_cleared") {
      await tx.orm.public.Review.create({
        submissionId: submission.id,
        reviewer: USERS.system,
        decision: "auto_cleared",
        reasonCode: null,
        comment: `No rule failures under rule set ${RULE_VERSION}`,
        ruleVersion: RULE_VERSION,
      });
      await tx.orm.public.AuditEvent.create({
        submissionId: submission.id,
        actor: USERS.system,
        action: "auto_cleared",
        detail: `Auto-cleared under rule set ${RULE_VERSION}`,
      });
    } else if (routing.qaSample) {
      await tx.orm.public.AuditEvent.create({
        submissionId: submission.id,
        actor: USERS.system,
        action: "qa_sampled",
        detail: "Selected for the 10% quality-assurance sample",
      });
    }
  });

  revalidatePath("/submissions");
  revalidatePath("/reviewer");
  redirect("/submissions?submitted=1");
}

class ActionStateError extends Error {}

export async function decide(
  submissionId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await assertRole("reviewer");
  const decision = String(formData.get("decision") ?? "");
  const reasonCode = String(formData.get("reasonCode") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();
  const validDecision = ["approved", "rejected", "changes_requested"].includes(
    decision,
  );
  const validReason = Object.keys(REASONS).includes(reasonCode);
  if (!validDecision) return { error: "Choose a valid compliance decision." };
  if (reasonCode && !validReason) return { error: "Choose a valid decision reason." };
  if (decision !== "approved" && !reasonCode) {
    return { error: "Choose a reason for rejecting or requesting changes." };
  }
  if (
    decision !== "approved" &&
    (reasonCode === "no_issues" || reasonCode === "false_positive_flags")
  ) {
    return { error: "That reason is only available when approving." };
  }
  if (decision !== "approved" && comment.length < 3) {
    return { error: "Add a comment so Marketing knows what to address." };
  }

  const reason = reasonCode ? (reasonCode as ReasonCode) : null;
  const decidedAt = new Date();
  try {
    await db.transaction(async (tx) => {
      const submission = await tx.orm.public.Submission
        .where({ id: submissionId })
        .forUpdate()
        .first();
      if (!submission || submission.status !== "pending") {
        const previous = await tx.orm.public.Review
          .where({ submissionId })
          .orderBy((review) => review.createdAt.desc())
          .first();
        throw new ActionStateError(
          previous
            ? `Already decided by ${previous.reviewer}.`
            : "This submission is no longer pending review.",
        );
      }

      const checks = await tx.orm.public.RuleCheck.where({ submissionId }).all();
      const unresolvedHigh = checks.filter(
        (check) => !check.passed && !check.dismissed && check.severity === "high",
      ).length;
      if (decision === "approved" && unresolvedHigh > 0 && !comment) {
        throw new ActionStateError(
          `Approving with ${unresolvedHigh} unresolved high-severity flags requires a comment.`,
        );
      }

      await tx.orm.public.Review.create({
        submissionId,
        reviewer: session.actor,
        decision,
        reasonCode: reason,
        comment,
        ruleVersion: submission.ruleVersion,
        createdAt: decidedAt,
      });
      await tx.orm.public.Submission.where({ id: submissionId, status: "pending" })
        .updateAll({ status: decision });
      await tx.orm.public.AuditEvent.create({
        submissionId,
        actor: session.actor,
        action: decision,
        detail: reason
          ? `${REASONS[reason].label}${comment ? `: ${comment}` : ""}`
          : `Approved under rule set ${submission.ruleVersion}${comment ? `: ${comment}` : ""}`,
        createdAt: decidedAt,
      });
    });
  } catch (error) {
    if (error instanceof ActionStateError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/reviewer");
  revalidatePath("/submissions");
  redirect(`/reviewer?decided=${encodeURIComponent(decision)}&at=${encodeURIComponent(decidedAt.toISOString())}`);
}

export async function dismissFlag(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await assertRole("reviewer");
  const ruleCheckId = String(formData.get("ruleCheckId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!ruleCheckId) return { error: "Choose a flag to dismiss." };
  if (note.length < 3) return { error: "Add a short note explaining the override." };

  try {
    await db.transaction(async (tx) => {
      const initialCheck = await tx.orm.public.RuleCheck
        .where({ id: ruleCheckId })
        .first();
      if (!initialCheck) throw new ActionStateError("Rule flag not found.");
      const submission = await tx.orm.public.Submission.where({
        id: initialCheck.submissionId,
      }).forUpdate().first();
      if (!submission || submission.status !== "pending") {
        throw new ActionStateError(
          "Flags can only be dismissed while a submission is pending.",
        );
      }
      const check = await tx.orm.public.RuleCheck
        .where({ id: ruleCheckId })
        .first();
      if (!check) throw new ActionStateError("Rule flag not found.");
      if (!check.passed && !check.dismissed) {
        await tx.orm.public.RuleCheck.where({ id: ruleCheckId }).updateAll({
          dismissed: true,
          dismissedBy: session.actor,
          dismissNote: note,
        });
        const checks = await tx.orm.public.RuleCheck.where({
          submissionId: submission.id,
        }).all();
        const riskScore = checks.reduce(
          (score, current) =>
            current.passed || current.dismissed
              ? score
              : score + (current.severity === "high" ? 3 : 1),
          0,
        );
        await tx.orm.public.Submission.where({ id: submission.id }).updateAll({
          riskScore,
        });
        await tx.orm.public.AuditEvent.create({
          submissionId: submission.id,
          actor: session.actor,
          action: "flag_dismissed",
          detail: `${check.ruleId}: ${note}`,
        });
      }
    });
  } catch (error) {
    if (error instanceof ActionStateError) return { error: error.message };
    throw error;
  }

  revalidatePath("/reviewer");
  redirect("/reviewer?flagDismissed=1");
}

export async function resubmit(
  parentId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await assertRole("submitter");
  const creativeText = String(formData.get("creativeText") ?? "").trim();
  if (creativeText.length < 20) {
    return { error: "Creative must be at least 20 characters." };
  }

  try {
    await db.transaction(async (tx) => {
      const parent = await tx.orm.public.Submission
        .where({ id: parentId })
        .forUpdate()
        .first();
      if (!parent || parent.status !== "changes_requested") {
        throw new ActionStateError(
          "Only a submission with changes requested can be resubmitted.",
        );
      }

      const result = runRules(
        creativeText,
        parent.product as Product,
        parent.channel as Channel,
      );
      const { failures, detail } = summarizeFlags(result.checks);
      const routing = initialRoute(failures);
      const child = await tx.orm.public.Submission.create({
        partner: parent.partner,
        product: parent.product,
        channel: parent.channel,
        creativeText,
        status: routing.status,
        riskScore: result.riskScore,
        ruleVersion: RULE_VERSION,
        submittedBy: session.actor,
        qaSample: routing.qaSample,
        version: parent.version + 1,
        parentId: parent.id,
      });
      await writeChecks(tx, child.id, result.checks);
      await tx.orm.public.AuditEvent.create({
        submissionId: child.id,
        actor: session.actor,
        action: "resubmitted",
        detail: `Resubmitted as v${child.version}. Auto-check: ${detail}`,
      });
      await tx.orm.public.Submission.where({ id: parent.id }).updateAll({
        status: "superseded",
      });
      await tx.orm.public.AuditEvent.create({
        submissionId: parent.id,
        actor: session.actor,
        action: "superseded",
        detail: `Superseded by v${child.version}`,
      });

      if (routing.status === "auto_cleared") {
        await tx.orm.public.Review.create({
          submissionId: child.id,
          reviewer: USERS.system,
          decision: "auto_cleared",
          reasonCode: null,
          comment: `No rule failures under rule set ${RULE_VERSION}`,
          ruleVersion: RULE_VERSION,
        });
        await tx.orm.public.AuditEvent.create({
          submissionId: child.id,
          actor: USERS.system,
          action: "auto_cleared",
          detail: `Auto-cleared under rule set ${RULE_VERSION}`,
        });
      } else if (routing.qaSample) {
        await tx.orm.public.AuditEvent.create({
          submissionId: child.id,
          actor: USERS.system,
          action: "qa_sampled",
          detail: "Selected for the 10% quality-assurance sample",
        });
      }
    });
  } catch (error) {
    if (error instanceof ActionStateError) return { error: error.message };
    throw error;
  }

  revalidatePath("/submissions");
  revalidatePath("/reviewer");
  redirect("/submissions?resubmitted=1");
}
