import { db } from "@/src/prisma/db";
import { SLA_HOURS } from "./constants";

export async function getSubmissions() {
  return db.orm.public.Submission.orderBy((submission) =>
    submission.createdAt.desc(),
  ).all();
}

export async function getRuleChecks() {
  return db.orm.public.RuleCheck.all();
}

export async function getAttachments() {
  return db.orm.public.Attachment.orderBy((attachment) => attachment.createdAt.asc()).all();
}

export async function getReviews() {
  return db.orm.public.Review.orderBy((review) => review.createdAt.asc()).all();
}

export async function getAuditEvents() {
  return db.orm.public.AuditEvent.orderBy((event) => event.createdAt.asc()).all();
}

export async function getSubmissionBundle(id: string) {
  const [submissions, checks, reviews, events, attachments] = await Promise.all([
    db.orm.public.Submission.where({ id }).all(),
    db.orm.public.RuleCheck.where({ submissionId: id }).all(),
    db.orm.public.Review.where({ submissionId: id }).orderBy((review) =>
      review.createdAt.asc(),
    ).all(),
    db.orm.public.AuditEvent.where({ submissionId: id }).orderBy((event) =>
      event.createdAt.asc(),
    ).all(),
    db.orm.public.Attachment.where({ submissionId: id }).orderBy((attachment) =>
      attachment.createdAt.asc(),
    ).all(),
  ]);
  return {
    submission: submissions[0] ?? null,
    checks,
    reviews,
    events,
    attachments,
  };
}

export function getPendingQueue<T extends {
  createdAt: Date;
  riskScore: number;
  id: string;
}>(submissions: readonly T[], now = Date.now()): T[] {
  return [...submissions].sort((a, b) => {
    const aBreached = now - a.createdAt.getTime() > SLA_HOURS * 3_600_000;
    const bBreached = now - b.createdAt.getTime() > SLA_HOURS * 3_600_000;
    if (aBreached !== bBreached) return aBreached ? -1 : 1;
    if (a.riskScore !== b.riskScore) return b.riskScore - a.riskScore;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

export function isSlaBreached(createdAt: Date, now = Date.now()): boolean {
  return now - createdAt.getTime() > SLA_HOURS * 3_600_000;
}

export type SubmissionRecord = Awaited<ReturnType<typeof getSubmissions>>[number];
export type RuleCheckRecord = Awaited<ReturnType<typeof getRuleChecks>>[number];
export type ReviewRecord = Awaited<ReturnType<typeof getReviews>>[number];
export type AuditEventRecord = Awaited<ReturnType<typeof getAuditEvents>>[number];
export type AttachmentRecord = Awaited<ReturnType<typeof getAttachments>>[number];

export function getSubmissionVersionLineage(
  submissions: readonly SubmissionRecord[],
  submissionId: string,
): SubmissionRecord[] {
  const byId = new Map(submissions.map((item) => [item.id, item]));
  const selected = byId.get(submissionId);
  if (!selected) return [];

  let root = selected;
  while (root.parentId) {
    const parent = byId.get(root.parentId);
    if (!parent) break;
    root = parent;
  }

  const lineage: SubmissionRecord[] = [];
  const visited = new Set<string>();
  const pending = [root];
  while (pending.length) {
    const item = pending.shift();
    if (!item || visited.has(item.id)) continue;
    visited.add(item.id);
    lineage.push(item);
    pending.push(...submissions.filter((candidate) => candidate.parentId === item.id));
  }
  return lineage.sort(
    (a, b) => a.version - b.version || a.createdAt.getTime() - b.createdAt.getTime(),
  );
}
