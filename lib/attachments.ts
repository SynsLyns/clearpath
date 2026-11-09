export const MAX_ATTACHMENT_COUNT = 5;
export const MAX_ATTACHMENT_SIZE_BYTES = 100 * 1024 * 1024;

const BLOCKED_EXTENSIONS = new Set([
  ".exe",
  ".msi",
  ".dmg",
  ".apk",
  ".bat",
  ".cmd",
  ".sh",
  ".scr",
  ".jar",
]);

export type AttachmentInput = {
  kind: "file" | "link";
  name: string;
  url: string;
  contentType: string | null;
  sizeBytes: number | null;
};

export type AttachmentPayloadResult =
  | { ok: true; attachments: AttachmentInput[] }
  | { ok: false; error: string };

export function isBlockedAttachmentName(name: string) {
  const basename = name.replaceAll("\\", "/").split("/").at(-1) ?? "";
  const extension = basename.match(/\.[^.]+$/)?.[0].toLowerCase();
  return extension ? BLOCKED_EXTENSIONS.has(extension) : false;
}

export function parseAttachmentPayload(
  value: string | null,
  inheritedCount = 0,
): AttachmentPayloadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value ?? "[]");
  } catch {
    return { ok: false, error: "Attachment details are invalid. Please review them and try again." };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, error: "Attachment details are invalid. Please review them and try again." };
  }
  if (inheritedCount + parsed.length > MAX_ATTACHMENT_COUNT) {
    return { ok: false, error: `A request can have up to ${MAX_ATTACHMENT_COUNT} attachments.` };
  }

  const attachments: AttachmentInput[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: "Attachment details are invalid. Please review them and try again." };
    }

    const candidate = item as Record<string, unknown>;
    if (
      (candidate.kind !== "file" && candidate.kind !== "link") ||
      typeof candidate.name !== "string" ||
      typeof candidate.url !== "string"
    ) {
      return { ok: false, error: "Attachment details are invalid. Please review them and try again." };
    }

    const name = candidate.name.trim();
    if (!name || name.length > 255) {
      return { ok: false, error: "Each attachment needs a name under 256 characters." };
    }
    if (candidate.kind === "file") {
      if (isBlockedAttachmentName(name)) {
        return { ok: false, error: `${name} uses a file type that cannot be uploaded.` };
      }
      if (
        typeof candidate.sizeBytes !== "number" ||
        !Number.isInteger(candidate.sizeBytes) ||
        candidate.sizeBytes < 0 ||
        candidate.sizeBytes > MAX_ATTACHMENT_SIZE_BYTES
      ) {
        return { ok: false, error: `${name} must be no larger than 100 MB.` };
      }
      if (!isPrivateVercelBlobUrl(candidate.url)) {
        return { ok: false, error: `${name} must be uploaded to the configured private Vercel Blob store.` };
      }
      if (
        candidate.contentType !== null &&
        (typeof candidate.contentType !== "string" || candidate.contentType.length > 255)
      ) {
        return { ok: false, error: `${name} has an invalid content type.` };
      }
      attachments.push({
        kind: "file",
        name,
        url: candidate.url,
        contentType: typeof candidate.contentType === "string" ? candidate.contentType : null,
        sizeBytes: candidate.sizeBytes,
      });
      continue;
    }

    const parsedUrl = parseLinkUrl(candidate.url);
    if (!parsedUrl) return { ok: false, error: `Enter a valid web link for ${name}.` };
    attachments.push({
      kind: "link",
      name,
      url: parsedUrl,
      contentType: null,
      sizeBytes: null,
    });
  }

  return { ok: true, attachments };
}

function isPrivateVercelBlobUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.hostname.endsWith(".private.blob.vercel-storage.com") &&
      url.pathname.length > 1 &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function parseLinkUrl(value: string) {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      url.href.length > 2048
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}
