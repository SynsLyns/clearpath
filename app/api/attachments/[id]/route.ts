import { issueSignedToken, presignUrl } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/src/prisma/db";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id } = await params;
  const attachment = await db.orm.public.Attachment.where({ id }).first();
  if (!attachment || attachment.kind !== "file") {
    return new NextResponse("Not found", { status: 404 });
  }

  const submission = await db.orm.public.Submission
    .where({ id: attachment.submissionId })
    .first();
  if (
    !submission ||
    (session.role === "submitter" && submission.submittedBy !== session.actor)
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  let blobUrl: URL;
  try {
    blobUrl = new URL(attachment.url);
  } catch {
    console.error("Attachment has an invalid private Blob URL", { attachmentId: id });
    return new NextResponse("Attachment could not be loaded.", { status: 502 });
  }
  if (
    blobUrl.protocol !== "https:" ||
    !blobUrl.hostname.endsWith(".private.blob.vercel-storage.com") ||
    !blobUrl.pathname.slice(1)
  ) {
    console.error("Attachment has an invalid private Blob URL", { attachmentId: id });
    return new NextResponse("Attachment could not be loaded.", { status: 502 });
  }

  try {
    const pathname = blobUrl.pathname.slice(1);
    const validUntil = Date.now() + 5 * 60 * 1000;
    const signedToken = await issueSignedToken({
      pathname,
      operations: ["get"],
      validUntil,
    });
    const { presignedUrl } = await presignUrl(signedToken, {
      access: "private",
      operation: "get",
      pathname,
      validUntil,
    });
    const destination = new URL(presignedUrl);
    if (destination.hostname !== blobUrl.hostname) {
      console.error("Signed attachment URL points to a different Blob store", {
        attachmentId: id,
      });
      return new NextResponse("Attachment could not be loaded.", { status: 502 });
    }
    const inlineType =
      /^image\/(?:jpeg|png|gif|webp|avif)$/.test(attachment.contentType ?? "") ||
      /^audio\/(?:aac|flac|mpeg|ogg|wav|webm)$/.test(attachment.contentType ?? "") ||
      /^video\/(?:mp4|mpeg|ogg|quicktime|webm)$/.test(attachment.contentType ?? "");
    const forceDownload =
      new URL(request.url).searchParams.has("download") || !inlineType;
    if (forceDownload) destination.searchParams.set("download", "1");

    return NextResponse.redirect(destination, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Unable to issue a signed attachment URL", {
      attachmentId: id,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return new NextResponse("Attachment could not be loaded.", { status: 502 });
  }
}
