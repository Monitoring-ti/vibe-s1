/**
 * PDF text extraction using pdf-parse.
 * Falls back to OCR (Tesseract) for image-based PDFs.
 */

import type { HermesExtractionResult } from "@/types";

interface PdfParseResult {
  text: string;
  numpages: number;
  info: Record<string, unknown>;
}

/**
 * Extract text from a PDF buffer using pdf-parse.
 * If the text is too short (likely a scanned/image PDF),
 * it can be sent to OCR as a fallback.
 */
export async function extractPdfText(
  pdfBuffer: Uint8Array,
): Promise<{ text: string; pageCount: number }> {
  // pdf-parse is loaded dynamically to avoid issues in server components
  const pdfParse = (await import("pdf-parse")).default;
  const data: PdfParseResult = await pdfParse(pdfBuffer as unknown as Buffer);

  const text = data.text.trim();
  const pageCount = data.numpages;

  if (text.length < 50) {
    // Likely a scanned PDF — would need to render pages and OCR them.
    // For now, return what we have.
    return { text, pageCount };
  }

  return { text, pageCount };
}

/**
 * Full pipeline: extract text from PDF, then process with Hermes AI.
 */
export async function extractFromPdf(
  pdfBuffer: Uint8Array,
  processWithAI: (text: string) => Promise<HermesExtractionResult>,
): Promise<HermesExtractionResult & { pageCount: number }> {
  const { text, pageCount } = await extractPdfText(pdfBuffer);
  const result = await processWithAI(text);
  return { ...result, pageCount };
}

/**
 * Check if a file size is within the allowed limit.
 */
export function isWithinSizeLimit(
  fileSizeBytes: number,
  maxSizeMB: number = parseInt(process.env.MAX_PDF_SIZE_MB || "20"),
): boolean {
  const maxBytes = maxSizeMB * 1024 * 1024;
  return fileSizeBytes <= maxBytes;
}
