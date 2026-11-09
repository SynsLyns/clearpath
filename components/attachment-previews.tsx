import { Download, ExternalLink, FileText } from "lucide-react";
import type { AttachmentRecord } from "@/lib/repository";

export function AttachmentPreviews({
  attachments,
}: {
  attachments: readonly AttachmentRecord[];
}) {
  if (!attachments.length) return null;

  return (
    <section className="content-card attachment-preview-card">
      <div className="content-card-heading">
        <div><FileText size={17} /><h2>Attachments</h2></div>
        <span>{attachments.length} {attachments.length === 1 ? "item" : "items"}</span>
      </div>
      <div className="attachment-previews">
        {attachments.map((attachment) => (
          <article className="attachment-preview" key={attachment.id}>
            {attachment.kind === "link" ? (
              <a href={attachment.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={16} /> Open {attachment.name}
              </a>
            ) : attachment.contentType?.startsWith("image/") ? (
              <a className="attachment-preview-image" href={`/api/attachments/${attachment.id}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- The authenticated proxy needs the browser's cookie. */}
                <img
                  src={`/api/attachments/${attachment.id}`}
                  alt={attachment.name}
                />
              </a>
            ) : attachment.contentType?.startsWith("video/") ? (
              <video controls preload="metadata" src={`/api/attachments/${attachment.id}`}>
                <a href={`/api/attachments/${attachment.id}?download=1`}>Download {attachment.name}</a>
              </video>
            ) : attachment.contentType?.startsWith("audio/") ? (
              <audio controls preload="metadata" src={`/api/attachments/${attachment.id}`}>
                <a href={`/api/attachments/${attachment.id}?download=1`}>Download {attachment.name}</a>
              </audio>
            ) : (
              <a href={`/api/attachments/${attachment.id}?download=1`}>
                <Download size={16} /> Open or download {attachment.name}
              </a>
            )}
            <div className="attachment-preview-meta">
              <strong>{attachment.name}</strong>
              <small>
                {attachment.kind === "link"
                  ? "External link"
                  : [attachment.contentType, formatBytes(attachment.sizeBytes)]
                      .filter(Boolean)
                      .join(" · ")}
              </small>
            </div>
          </article>
        ))}
      </div>
      <p className="attachment-review-note">Attachments are not processed automatically and require manual review.</p>
    </section>
  );
}

function formatBytes(bytes: number | null) {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
