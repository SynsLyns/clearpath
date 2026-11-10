import { Download, ExternalLink, FileText } from "lucide-react";
import type { AttachmentRecord } from "@/lib/repository";
import { ExtractionRefresh } from "@/components/extraction-refresh";

export function AttachmentPreviews({
  attachments,
  showExtractedText = false,
}: {
  attachments: readonly AttachmentRecord[];
  showExtractedText?: boolean;
}) {
  if (!attachments.length) return null;

  const hasProcessingAttachments = attachments.some(
    (attachment) =>
      attachment.kind === "file" && attachment.extractionStatus === "processing",
  );

  return (
    <section className="content-card attachment-preview-card">
      {showExtractedText && <ExtractionRefresh active={hasProcessingAttachments} />}
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
              {showExtractedText && attachment.kind === "file" && (
                <small className="extraction-status">
                  Text extraction: {formatExtractionStatus(attachment.extractionStatus)}
                  {attachment.extractionMethod && ` · ${attachment.extractionMethod}`}
                </small>
              )}
            </div>
            {showExtractedText && attachment.extractionError && (
              <p className="extraction-error">{attachment.extractionError}</p>
            )}
            {showExtractedText && attachment.extractedText && (
              <details className="extracted-text">
                <summary>View extracted text</summary>
                <pre>{attachment.extractedText}</pre>
              </details>
            )}
          </article>
        ))}
      </div>
      {showExtractedText && hasProcessingAttachments && (
        <p className="muted-copy">
          Attachment screening is running. This page refreshes automatically when results are ready.
        </p>
      )}
      <p className="attachment-review-note">
        Supported PDFs and images are screened automatically, subject to processing limits; other files may not be. Extraction can miss content or visual context, so every attachment still requires manual review.
      </p>
    </section>
  );
}

function formatExtractionStatus(status: string) {
  const labels: Record<string, string> = {
    not_processed: "Not processed",
    not_applicable: "Not applicable",
    processing: "Processing",
    extracted: "Complete",
    partial: "Partial",
    no_text: "No readable text",
    unsupported: "Unsupported file type",
    limit_exceeded: "Processing limit reached",
    failed: "Failed",
  };
  return labels[status] ?? "Unknown";
}

function formatBytes(bytes: number | null) {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
