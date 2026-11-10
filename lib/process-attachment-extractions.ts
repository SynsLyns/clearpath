import { revalidatePath } from "next/cache";
import { db } from "@/src/prisma/db";
import { extractAttachments } from "@/lib/attachment-extraction";
import { runSubmissionRules } from "@/lib/rules";
import type { AttachmentInput } from "@/lib/attachments";
import type { Channel, Product } from "@/lib/constants";
import type { RuleResult } from "@/lib/rules";

const EXTRACTION_FAILED_ERROR =
  "Automatic text extraction could not be completed. Review the original attachment.";

async function markQueuedAttachmentsFailed(submissionId: string) {
  await db.transaction(async (tx) => {
    const attachments = await tx.orm.public.Attachment
      .where({ submissionId })
      .all();
    const pending = attachments.filter(
      (attachment) =>
        attachment.kind === "file" &&
        attachment.extractionStatus === "processing",
    );
    for (const attachment of pending) {
      await tx.orm.public.Attachment.where({ id: attachment.id }).updateAll({
        extractionStatus: "failed",
        extractionError: EXTRACTION_FAILED_ERROR,
        extractedAt: new Date(),
      });
    }
  });
}

function isPendingFile(
  attachment: { kind: string; extractionStatus: string },
): boolean {
  return attachment.kind === "file" && attachment.extractionStatus === "processing";
}

export async function processAttachmentExtractions(submissionId: string) {
  try {
    const initialAttachments = await db.orm.public.Attachment
      .where({ submissionId })
      .all();
    const pending = initialAttachments.filter(isPendingFile);
    if (!pending.length) return;

    const inputs: AttachmentInput[] = pending.map((attachment) => ({
      kind: "file",
      name: attachment.name,
      url: attachment.url,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
    }));
    const results = await extractAttachments(inputs);
    const resultById = new Map(
      pending.map((attachment, index) => [attachment.id, results[index]]),
    );

    await db.transaction(async (tx) => {
      const submission = await tx.orm.public.Submission
        .where({ id: submissionId })
        .forUpdate()
        .first();
      if (!submission) return;

      const currentAttachments = await tx.orm.public.Attachment
        .where({ submissionId })
        .orderBy((attachment) => attachment.createdAt.asc())
        .all();
      const queued = currentAttachments.filter(isPendingFile);
      if (!queued.length) return;

      const updatedAttachments = currentAttachments.map((attachment) => {
        if (!isPendingFile(attachment)) return attachment;
        const result = resultById.get(attachment.id);
        if (!result) {
          throw new Error(`Missing extraction result for attachment ${attachment.id}.`);
        }
        return { ...attachment, ...result };
      });

      for (const attachment of queued) {
        const result = resultById.get(attachment.id);
        if (!result) {
          throw new Error(`Missing extraction result for attachment ${attachment.id}.`);
        }
        await tx.orm.public.Attachment.where({ id: attachment.id }).updateAll({
          extractionStatus: result.extractionStatus,
          extractedText: result.extractedText,
          extractionError: result.extractionError,
          extractionMethod: result.extractionMethod,
          extractedAt: new Date(),
        });
      }

      const evaluated = runSubmissionRules(
        submission.creativeText,
        submission.product as Product,
        submission.channel as Channel,
        updatedAttachments.map((attachment) => ({
          name: attachment.name,
          extractedText: attachment.extractedText,
        })),
      );
      const queuedSourceNames = new Set(
        updatedAttachments.flatMap((attachment, index) =>
          queued.some((item) => item.id === attachment.id)
            ? [`Attachment ${index + 1}: ${attachment.name}`]
            : [],
        ),
      );
      const extractionChecks = evaluated.checks.filter(
        (check): check is RuleResult & { sourceName: string } =>
          Boolean(check.sourceName && queuedSourceNames.has(check.sourceName)),
      );
      for (const check of extractionChecks) {
        await tx.orm.public.RuleCheck.create({
          submissionId,
          ruleId: check.ruleId,
          severity: check.severity,
          passed: check.passed,
          message: check.message,
          authority: check.authority,
          snippet: check.snippet,
          sourceName: check.sourceName,
        });
      }

      const checks = await tx.orm.public.RuleCheck
        .where({ submissionId })
        .all();
      const riskScore = checks.reduce(
        (score, check) =>
          check.passed || check.dismissed
            ? score
            : score + (check.severity === "high" ? 3 : 1),
        0,
      );
      await tx.orm.public.Submission.where({ id: submissionId }).updateAll({
        riskScore,
      });
      const failedCount = queued.filter(
        (attachment) =>
          resultById.get(attachment.id)?.extractionStatus === "failed",
      ).length;
      await tx.orm.public.AuditEvent.create({
        submissionId,
        actor: "system",
        action: "attachments_processed",
        detail: `Text extraction completed for ${queued.length} file${queued.length === 1 ? "" : "s"}; ${failedCount} failed.`,
      });
    });
  } catch (error) {
    console.error("Background attachment text extraction failed", {
      submissionId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    try {
      await markQueuedAttachmentsFailed(submissionId);
    } catch (markError) {
      console.error("Unable to mark queued attachments as failed", {
        submissionId,
        errorName: markError instanceof Error ? markError.name : "UnknownError",
      });
    }
  }

  revalidatePath("/reviewer");
  revalidatePath("/reviewer/requests");
  revalidatePath(`/reviewer/${submissionId}`);
  revalidatePath(`/submissions/${submissionId}`);
}
