import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";
import { extractAttachmentBytes } from "@/lib/attachment-extraction";
import { runSubmissionRules } from "@/lib/rules";

function makePdf(objects: (string | Buffer)[]) {
  const chunks = [Buffer.from("%PDF-1.4\n")];
  const offsets = [0];
  let length = chunks[0].length;

  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(length);
    const object = objects[index];
    const chunk = Buffer.isBuffer(object)
      ? Buffer.concat([
          Buffer.from(`${index + 1} 0 obj\n`),
          object,
          Buffer.from("\nendobj\n"),
        ])
      : Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`);
    chunks.push(chunk);
    length += chunk.length;
  }

  const xrefOffset = length;
  const xref = [
    `xref\n0 ${offsets.length}\n`,
    "0000000000 65535 f \n",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  ].join("");
  chunks.push(Buffer.from(xref));
  return Buffer.concat(chunks);
}

function makeTextPdf(text: string) {
  const content = Buffer.from(`BT /F1 18 Tf 50 700 Td (${text}) Tj ET`);
  return makePdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`),
      content,
      Buffer.from("\nendstream"),
    ]),
  ]);
}

function makeScannedPdf(image: Buffer, width: number, height: number) {
  const content = Buffer.from(`q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`);
  return makePdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`,
    Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`),
      content,
      Buffer.from("\nendstream"),
    ]),
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${width * 3} /Height ${height * 3} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`,
      ),
      image,
      Buffer.from("\nendstream"),
    ]),
  ]);
}

async function main() {
  const textPdf = makeTextPdf(
    "Guaranteed approval is promised to every applicant without exception.",
  );
  const digital = await extractAttachmentBytes(textPdf);
  assert.equal(digital.extractionStatus, "extracted");
  assert.match(digital.extractedText ?? "", /Guaranteed approval/i);
  assert.equal(digital.extractionMethod, "pdf_text");

  const canvas = createCanvas(1800, 360);
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, 1800, 360);
  context.fillStyle = "#000";
  context.font = "bold 130px sans-serif";
  context.fillText("Guaranteed approval", 35, 220);
  const jpeg = await sharp(canvas.toBuffer("image/png")).jpeg({ quality: 95 }).toBuffer();

  const scannedPdf = await extractAttachmentBytes(makeScannedPdf(jpeg, 600, 120));
  assert.ok(
    scannedPdf.extractionStatus === "extracted" || scannedPdf.extractionStatus === "partial",
    `Scanned PDF extraction returned ${scannedPdf.extractionStatus}.`,
  );
  assert.match(scannedPdf.extractedText ?? "", /guaranteed/i);
  assert.equal(scannedPdf.extractionMethod, "pdf_text+ocr");
  const screened = runSubmissionRules("Learn more about this offer.", "credit_card", "social", [
    { name: "scanned-ad.pdf", extractedText: scannedPdf.extractedText },
  ]);
  const attachmentFlag = screened.checks.find(
    (check) => check.ruleId === "guaranteed_approval" && !check.passed,
  );
  assert.equal(attachmentFlag?.sourceName, "Attachment 1: scanned-ad.pdf");
  assert.equal(
    screened.checks.find((check) => check.ruleId === "manual_review_required")?.passed,
    false,
  );

  const image = await extractAttachmentBytes(jpeg);
  assert.ok(
    image.extractionStatus === "extracted" || image.extractionStatus === "partial",
    `Image OCR returned ${image.extractionStatus}.`,
  );
  assert.match(image.extractedText ?? "", /guaranteed/i);
  assert.equal(image.extractionMethod, "image_ocr");

  const unsupported = await extractAttachmentBytes(Buffer.from("not a supported document"));
  assert.equal(unsupported.extractionStatus, "unsupported");

  const oversized = await extractAttachmentBytes(Buffer.alloc(8 * 1024 * 1024 + 1));
  assert.equal(oversized.extractionStatus, "limit_exceeded");

  console.log("Passed digital PDF, scanned PDF OCR, image OCR, unsupported type, and size-limit checks.");
}

void main();
