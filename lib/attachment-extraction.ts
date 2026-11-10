import { get } from "@vercel/blob";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFPageProxy } from "pdfjs-dist";
import sharp from "sharp";
import Tesseract from "tesseract.js";
import { mkdir } from "node:fs/promises";
import type * as CanvasModule from "@napi-rs/canvas";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AttachmentInput } from "@/lib/attachments";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 24_000_000;
const MAX_RENDER_PIXELS = 8_000_000;
const MAX_RENDER_DIMENSION = 3_500;
const MAX_PDF_PAGES_PER_FILE = 20;
const MAX_PDF_PAGES_PER_SUBMISSION = 30;
const MAX_OCR_PAGES_PER_SUBMISSION = 8;
const MAX_TEXT_CHARS_PER_FILE = 40_000;
const MAX_TEXT_CHARS_PER_SUBMISSION = 120_000;
const cachePath = join(tmpdir(), "clearpath-tesseract");
const nodeModule = process.getBuiltinModule("node:module");
if (!nodeModule) throw new Error("Node's module loader is unavailable for image rendering.");
const nodeRequire = nodeModule.createRequire(join(process.cwd(), "package.json"));
const { createCanvas } = nodeRequire("@napi-rs/canvas") as typeof CanvasModule;

const UNSUPPORTED_ERROR =
  "Text extraction supports PDF, JPEG, PNG, WebP, and TIFF files. Review the original attachment.";
const LIMIT_ERROR =
  "Automatic text extraction limits were reached. Review the original attachment.";
const EMPTY_ERROR =
  "No readable text was extracted. Review the original attachment.";
const FAILED_ERROR =
  "Text extraction could not be completed. Review the original attachment.";

export type AttachmentExtractionStatus =
  | "not_processed"
  | "not_applicable"
  | "extracted"
  | "partial"
  | "no_text"
  | "unsupported"
  | "limit_exceeded"
  | "failed";

export type ProcessedAttachment = AttachmentInput & {
  extractionStatus: AttachmentExtractionStatus;
  extractedText: string | null;
  extractionError: string | null;
  extractionMethod: string | null;
  extractedAt: Date | null;
};

type ExtractionBudget = {
  ocrPagesRemaining: number;
  pdfPagesRemaining: number;
  textCharactersRemaining: number;
};

type ExtractedContent = {
  text: string;
  method: string;
  partial: boolean;
  partialError?: string;
};

const modulesPath = join(process.cwd(), "node_modules");
const langPath = join(modulesPath, "@tesseract.js-data", "eng", "4.0.0");
const corePath = join(modulesPath, "tesseract.js-core");
const workerPath = join(
  modulesPath,
  "tesseract.js",
  "src",
  "worker-script",
  "node",
  "index.js",
);

let workerPromise: ReturnType<typeof Tesseract.createWorker> | undefined;
let workerQueue: Promise<void> = Promise.resolve();

function getOcrWorker() {
  workerPromise ??= (async () => {
    await mkdir(cachePath, { recursive: true });
    return Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, {
      cachePath,
      corePath,
      langPath,
      workerPath,
    });
  })().catch((error: unknown) => {
    workerPromise = undefined;
    throw error;
  });
  return workerPromise;
}

async function withOcrWorker<T>(operation: () => Promise<T>): Promise<T> {
  let releaseQueue!: () => void;
  const previous = workerQueue;
  workerQueue = new Promise((resolve) => {
    releaseQueue = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    try {
      if (workerPromise) {
        const worker = await workerPromise;
        await worker.terminate();
      }
    } finally {
      workerPromise = undefined;
      releaseQueue();
    }
  }
}

async function recognizeText(image: Buffer) {
  const worker = await getOcrWorker();
  return normalizeText((await worker.recognize(image)).data.text);
}

function normalizeText(text: string) {
  return text.replaceAll("\u0000", "").replace(/\s+/g, " ").trim();
}

function isPdf(bytes: Buffer) {
  return bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"));
}

function imageFormat(bytes: Buffer): "jpeg" | "png" | "webp" | "tiff" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "png";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  if (
    bytes.length >= 4 &&
    ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
      (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a))
  ) {
    return "tiff";
  }
  return null;
}

async function readBlob(url: string, declaredSize: number | null) {
  const blob = await get(url, { access: "private" });
  if (!blob || blob.statusCode !== 200) {
    return { status: "failed" as const, error: FAILED_ERROR };
  }
  if (blob.blob.size > MAX_FILE_BYTES) {
    await blob.stream.cancel();
    return { status: "limit_exceeded" as const, error: LIMIT_ERROR };
  }
  if (declaredSize !== null && blob.blob.size !== declaredSize) {
    await blob.stream.cancel();
    return { status: "failed" as const, error: FAILED_ERROR };
  }

  const reader = blob.stream.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_FILE_BYTES) {
        await reader.cancel();
        return { status: "limit_exceeded" as const, error: LIMIT_ERROR };
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes !== blob.blob.size) {
    return { status: "failed" as const, error: FAILED_ERROR };
  }
  return { status: "ready" as const, bytes: Buffer.concat(chunks) };
}

async function ocrPdfPage(
  page: PDFPageProxy,
  budget: ExtractionBudget,
) {
  if (budget.ocrPagesRemaining === 0) return { text: "", limited: true };

  const originalViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(
    2,
    MAX_RENDER_DIMENSION / originalViewport.width,
    MAX_RENDER_DIMENSION / originalViewport.height,
    Math.sqrt(MAX_RENDER_PIXELS / (originalViewport.width * originalViewport.height)),
  );
  if (!Number.isFinite(scale) || scale < 0.25) return { text: "", limited: true };

  const viewport = page.getViewport({ scale });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  if (width * height > MAX_RENDER_PIXELS) return { text: "", limited: true };

  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  await page.render({
    canvas: null,
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;
  budget.ocrPagesRemaining -= 1;
  return { text: await recognizeText(canvas.toBuffer("image/png")), limited: false };
}

async function extractPdf(bytes: Buffer, budget: ExtractionBudget): Promise<ExtractedContent> {
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    maxImageSize: MAX_IMAGE_PIXELS,
    stopAtErrors: true,
    useSystemFonts: true,
  });
  const document = await loadingTask.promise;
  const pageCount = Math.min(
    document.numPages,
    MAX_PDF_PAGES_PER_FILE,
    budget.pdfPagesRemaining,
  );
  budget.pdfPagesRemaining -= pageCount;
  let text = "";
  let usedOcr = false;
  let partial = pageCount < document.numPages;

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      if (
        text.length >= MAX_TEXT_CHARS_PER_FILE ||
        text.length >= budget.textCharactersRemaining
      ) {
        partial = true;
        break;
      }

      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = normalizeText(
        content.items
          .filter((item) => "str" in item)
          .map((item) => ("str" in item ? item.str : ""))
          .join(" "),
      );
      if (pageText) text += `${text ? "\n" : ""}${pageText}`;

      const operators = await page.getOperatorList();
      const hasImages = operators.fnArray.some((operator) =>
        [
          OPS.paintImageXObject,
          OPS.paintInlineImageXObject,
          OPS.paintImageMaskXObject,
          OPS.paintImageXObjectRepeat,
        ].includes(operator),
      );
      if (pageText.length < 40 || hasImages) {
        const ocr = await ocrPdfPage(page, budget);
        if (ocr.limited) {
          partial = true;
        } else {
          usedOcr = true;
          if (ocr.text) text += `${text ? "\n" : ""}${ocr.text}`;
        }
      }
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  return { text, method: usedOcr ? "pdf_text+ocr" : "pdf_text", partial };
}

async function extractImage(
  bytes: Buffer,
  budget: ExtractionBudget,
): Promise<ExtractedContent> {
  if (budget.ocrPagesRemaining === 0) {
    return { text: "", method: "image_ocr", partial: true };
  }

  const image = sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new Error("Image dimensions or format are unavailable.");
  }
  if (metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
    return { text: "", method: "image_ocr", partial: true };
  }
  if (!["jpeg", "png", "webp", "tiff"].includes(metadata.format)) {
    throw new UnsupportedImageError();
  }

  const scale = Math.min(
    1,
    MAX_RENDER_DIMENSION / Math.max(metadata.width, metadata.height),
    Math.sqrt(MAX_RENDER_PIXELS / (metadata.width * metadata.height)),
  );
  const multipage = (metadata.pages ?? 1) > 1;
  const normalizedImage = await sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    .resize({
      width: Math.max(1, Math.floor(metadata.width * scale)),
      height: Math.max(1, Math.floor(metadata.height * scale)),
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  budget.ocrPagesRemaining -= 1;
  return {
    text: await recognizeText(normalizedImage),
    method: "image_ocr",
    partial: multipage,
    partialError: multipage
      ? "Only the first image frame or page was screened. Review all original content."
      : undefined,
  };
}

class UnsupportedImageError extends Error {}

function capExtractedText(text: string, budget: ExtractionBudget) {
  const limit = Math.min(MAX_TEXT_CHARS_PER_FILE, budget.textCharactersRemaining);
  const capped = text.slice(0, limit).trim();
  budget.textCharactersRemaining -= capped.length;
  return { text: capped, truncated: capped.length < text.trim().length };
}

type TextExtractionResult = Pick<
  ProcessedAttachment,
  "extractionStatus" | "extractedText" | "extractionError" | "extractionMethod"
>;

async function extractBytes(
  bytes: Buffer,
  budget: ExtractionBudget,
  attachmentName: string,
): Promise<TextExtractionResult> {
  if (bytes.length > MAX_FILE_BYTES) {
    return {
      extractionStatus: "limit_exceeded",
      extractedText: null,
      extractionError: LIMIT_ERROR,
      extractionMethod: null,
    };
  }
  try {
    const content = isPdf(bytes)
      ? await extractPdf(bytes, budget)
      : imageFormat(bytes)
        ? await extractImage(bytes, budget)
        : null;
    if (!content) {
      return {
        extractionStatus: "unsupported",
        extractedText: null,
        extractionError: UNSUPPORTED_ERROR,
        extractionMethod: null,
      };
    }

    const capped = capExtractedText(content.text, budget);
    const partial = content.partial || capped.truncated;
    return {
      extractionStatus: capped.text
        ? partial ? "partial" : "extracted"
        : partial ? "limit_exceeded" : "no_text",
      extractedText: capped.text || null,
      extractionError: partial
        ? content.partialError ?? LIMIT_ERROR
        : capped.text ? null : EMPTY_ERROR,
      extractionMethod: content.method,
    };
  } catch (error) {
    if (error instanceof UnsupportedImageError) {
      return {
        extractionStatus: "unsupported",
        extractedText: null,
        extractionError: UNSUPPORTED_ERROR,
        extractionMethod: null,
      };
    }
    console.error("Attachment text extraction failed", {
      attachment: attachmentName,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      extractionStatus: "failed",
      extractedText: null,
      extractionError: FAILED_ERROR,
      extractionMethod: null,
    };
  }
}

function createBudget(): ExtractionBudget {
  return {
    ocrPagesRemaining: MAX_OCR_PAGES_PER_SUBMISSION,
    pdfPagesRemaining: MAX_PDF_PAGES_PER_SUBMISSION,
    textCharactersRemaining: MAX_TEXT_CHARS_PER_SUBMISSION,
  };
}

export async function extractAttachmentBytes(bytes: Uint8Array): Promise<TextExtractionResult> {
  return withOcrWorker(() =>
    extractBytes(Buffer.from(bytes), createBudget(), "attachment"),
  );
}

async function extractFile(
  attachment: AttachmentInput,
  budget: ExtractionBudget,
): Promise<ProcessedAttachment> {
  const base = {
    ...attachment,
    extractionStatus: "failed" as AttachmentExtractionStatus,
    extractedText: null,
    extractionError: FAILED_ERROR,
    extractionMethod: null,
    extractedAt: new Date(),
  };
  try {
    const readResult = await readBlob(attachment.url, attachment.sizeBytes);
    if (readResult.status !== "ready") {
      return {
        ...base,
        extractionStatus: readResult.status,
        extractionError: readResult.error,
      };
    }

    const result = await extractBytes(readResult.bytes, budget, attachment.name);
    return {
      ...base,
      ...result,
    };
  } catch (error) {
    console.error("Attachment text extraction failed", {
      attachment: attachment.name,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return base;
  }
}

export async function extractAttachments(
  attachments: readonly AttachmentInput[],
): Promise<ProcessedAttachment[]> {
  return withOcrWorker(async () => {
    const budget = createBudget();
    const processed: ProcessedAttachment[] = [];
    for (const attachment of attachments) {
      if (attachment.kind === "link") {
        processed.push({
          ...attachment,
          extractionStatus: "not_applicable",
          extractedText: null,
          extractionError: null,
          extractionMethod: null,
          extractedAt: null,
        });
      } else {
        processed.push(await extractFile(attachment, budget));
      }
    }
    return processed;
  });
}
