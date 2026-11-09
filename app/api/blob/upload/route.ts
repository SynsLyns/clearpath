import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { MAX_ATTACHMENT_SIZE_BYTES, isBlockedAttachmentName } from "@/lib/attachments";
import { assertRole } from "@/lib/session";

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "File uploads are not configured. Add a Vercel Blob read-write token." },
      { status: 503 },
    );
  }

  try {
    const body = await request.json() as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        await assertRole("submitter");
        if (!pathname.startsWith("attachments/")) {
          throw new Error("Uploads must use the attachment path.");
        }
        if (isBlockedAttachmentName(pathname)) {
          throw new Error("This file type cannot be uploaded.");
        }
        return {
          maximumSizeInBytes: MAX_ATTACHMENT_SIZE_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "File upload authorization failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
