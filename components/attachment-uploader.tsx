"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { AlertCircle, FilePlus2, Link2, LoaderCircle, Trash2 } from "lucide-react";
import {
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_SIZE_BYTES,
  isBlockedAttachmentName,
  type AttachmentInput,
} from "@/lib/attachments";

type ExistingAttachment = {
  id: string;
  kind: string;
  name: string;
  url: string;
  contentType: string | null;
  sizeBytes: number | null;
};
type StagedAttachment = AttachmentInput & {
  id: string;
  status: "uploading" | "uploaded" | "error";
  progress: number;
  error?: string;
};

const initialItems: StagedAttachment[] = [];
const emptyExistingAttachments: readonly ExistingAttachment[] = [];

export function AttachmentUploader({
  existingAttachments = emptyExistingAttachments,
  onChange,
}: {
  existingAttachments?: readonly ExistingAttachment[];
  onChange: (names: string[], ready: boolean) => void;
}) {
  const [items, setItems] = useState(initialItems);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [error, setError] = useState("");
  const controllers = useRef(new Map<string, AbortController>());
  const inputRef = useRef<HTMLInputElement>(null);

  const ready = items.every((item) => item.status === "uploaded");
  useEffect(() => {
    onChange(
      [...existingAttachments.map((item) => item.name), ...items.map((item) => item.name)],
      ready,
    );
  }, [existingAttachments, items, onChange, ready]);

  const appendFiles = (files: File[]) => {
    setError("");
    const remaining = MAX_ATTACHMENT_COUNT - existingAttachments.length - items.length;
    if (files.length > remaining) {
      setError(`A request can have up to ${MAX_ATTACHMENT_COUNT} attachments.`);
      files = files.slice(0, Math.max(0, remaining));
    }

    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        setError(`${file.name} is larger than 100 MB.`);
        continue;
      }
      if (isBlockedAttachmentName(file.name)) {
        setError(`${file.name} uses a file type that cannot be uploaded.`);
        continue;
      }
      const id = crypto.randomUUID();
      const controller = new AbortController();
      controllers.current.set(id, controller);
      setItems((current) => [
        ...current,
        {
          id,
          kind: "file",
          name: file.name,
          url: "",
          contentType: file.type || null,
          sizeBytes: file.size,
          status: "uploading",
          progress: 0,
        },
      ]);
      void upload(
        `attachments/${id}/${safeFilename(file.name)}`,
        file,
        {
          access: "private",
          handleUploadUrl: "/api/blob/upload",
          contentType: file.type || undefined,
          multipart: file.size > 4_500_000,
          abortSignal: controller.signal,
          onUploadProgress: ({ percentage }) => {
            setItems((current) => current.map((item) =>
              item.id === id ? { ...item, progress: percentage } : item,
            ));
          },
        },
      ).then((blob) => {
        setItems((current) => current.map((item) =>
          item.id === id
            ? {
                ...item,
                url: blob.url,
                contentType: blob.contentType || item.contentType,
                status: "uploaded",
                progress: 100,
              }
            : item,
        ));
      }).catch((uploadError: unknown) => {
        if (controller.signal.aborted) return;
        const message = uploadError instanceof Error ? uploadError.message : "Upload failed. Please try again.";
        setItems((current) => current.map((item) =>
          item.id === id ? { ...item, status: "error", error: message } : item,
        ));
      }).finally(() => controllers.current.delete(id));
    }
  };

  const addLink = () => {
    setError("");
    const name = linkName.trim();
    const value = linkUrl.trim();
    try {
      const url = new URL(value);
      if (!name || name.length > 255 || (url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
        setError("Enter a name and a valid HTTP or HTTPS link.");
        return;
      }
      if (existingAttachments.length + items.length >= MAX_ATTACHMENT_COUNT) {
        setError(`A request can have up to ${MAX_ATTACHMENT_COUNT} attachments.`);
        return;
      }
      setItems((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          kind: "link",
          name,
          url: url.href,
          contentType: null,
          sizeBytes: null,
          status: "uploaded",
          progress: 100,
        },
      ]);
      setLinkName("");
      setLinkUrl("");
    } catch {
      setError("Enter a valid HTTP or HTTPS link.");
    }
  };

  const removeItem = (id: string) => {
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const attachmentsValue = JSON.stringify(
    items
      .filter((item) => item.status === "uploaded")
      .map(({ kind, name, url, contentType, sizeBytes }) => ({
        kind,
        name,
        url,
        contentType,
        sizeBytes,
      })),
  );

  return (
    <section className="attachment-uploader" aria-label="Attachments">
      <input type="hidden" name="attachments" value={attachmentsValue} />
      <div className="attachment-heading">
        <div><FilePlus2 size={16} /><strong>Attachments or links</strong></div>
        <span>{existingAttachments.length + items.length}/{MAX_ATTACHMENT_COUNT}</span>
      </div>
      {existingAttachments.length > 0 && (
        <ul className="attachment-list">
          {existingAttachments.map((item, index) => (
            <li key={`${item.url}-${index}`}>
              <span><Link2 size={14} />{item.name}<small>From the previous version</small></span>
              {item.kind === "link" ? (
                <a href={item.url} target="_blank" rel="noopener noreferrer">Open</a>
              ) : (
                <a href={`/api/attachments/${item.id}?download=1`}>Open</a>
              )}
            </li>
          ))}
        </ul>
      )}
      <label
        className="attachment-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          appendFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={(event) => {
            appendFiles(Array.from(event.currentTarget.files ?? []));
            event.currentTarget.value = "";
          }}
        />
        <FilePlus2 size={19} />
        <span><strong>Choose files</strong> or drag and drop</span>
        <small>PDF, JPEG, PNG, WebP, and TIFF text extraction up to 8 MB · any format up to 100 MB · no executables</small>
      </label>
      {items.length > 0 && (
        <ul className="attachment-list">
          {items.map((item) => (
            <li key={item.id}>
              <span>
                {item.status === "uploading"
                  ? <LoaderCircle className="attachment-spinner" size={14} />
                  : item.kind === "link" ? <Link2 size={14} /> : <FilePlus2 size={14} />}
                {item.name}
                <small>
                  {item.status === "uploading"
                    ? `Uploading ${Math.round(item.progress)}%`
                    : item.error ?? (item.kind === "link" ? "Link added" : formatBytes(item.sizeBytes))}
                </small>
              </span>
              <button type="button" aria-label={`Remove ${item.name}`} onClick={() => removeItem(item.id)}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="attachment-link-form">
        <input
          value={linkName}
          onChange={(event) => setLinkName(event.currentTarget.value)}
          placeholder="Link name"
          aria-label="Link name"
          maxLength={255}
        />
        <input
          type="url"
          value={linkUrl}
          onChange={(event) => setLinkUrl(event.currentTarget.value)}
          placeholder="https://example.com"
          aria-label="Link URL"
        />
        <button type="button" className="button button-outline" onClick={addLink} disabled={!linkName.trim() || !linkUrl.trim()}>
          <Link2 size={14} /> Add link
        </button>
      </div>
      {error && <p className="attachment-error" role="alert"><AlertCircle size={14} />{error}</p>}
      {!ready && items.some((item) => item.status === "uploading") && (
        <p className="attachment-upload-note">Wait for uploads to finish before submitting.</p>
      )}
    </section>
  );
}

function safeFilename(name: string) {
  return name.replaceAll("\\", "/").split("/").at(-1)?.replace(/[^a-zA-Z0-9._-]/g, "_") || "attachment";
}

function formatBytes(bytes: number | null) {
  if (bytes === null) return "Link added";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
