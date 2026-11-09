import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/src/prisma/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id } = await params;
  const attachments = await db.orm.public.Attachment.where({ id }).all();
  const attachment = attachments[0];
  if (!attachment || attachment.kind !== "file") {
    return new NextResponse("Not found", { status: 404 });
  }

  const submissions = await db.orm.public.Submission
    .where({ id: attachment.submissionId })
    .all();
  const submission = submissions[0];
  if (
    !submission ||
    (session.role === "submitter" && submission.submittedBy !== session.actor)
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  const blob = await get(attachment.url, { access: "private" });
  if (!blob || blob.statusCode !== 200) {
    return new NextResponse("Not found", { status: 404 });
  }

  const contentType = blob.blob.contentType;
  const inlineType =
    /^image\/(?:jpeg|png|gif|webp|avif)$/.test(contentType) ||
    /^audio\/(?:aac|flac|mpeg|ogg|wav|webm)$/.test(contentType) ||
    /^video\/(?:mp4|mpeg|ogg|quicktime|webm)$/.test(contentType);
  const disposition =
    new URL(request.url).searchParams.has("download") ||
    !inlineType
      ? "attachment"
      : "inline";
  const filename = attachment.name.replace(/[^\x20-\x7e]|["\\;]/g, "_") || "attachment";
  const encodedFilename = encodeURIComponent(attachment.name).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return new NextResponse(blob.stream, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `${disposition}; filename="${filename}"; filename*=UTF-8''${encodedFilename}`,
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
