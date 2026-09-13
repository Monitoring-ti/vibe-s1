/**
 * OCR processing using Tesseract.js.
 * Extracts text from image-based PDFs or direct images.
 */

import type { Worker } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;

/**
 * Initialize the Tesseract worker with the configured language.
 * Lazy-loads to avoid loading on every call.
 */
async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    const { createWorker } = await import("tesseract.js");
    const lang = process.env.OCR_LANGUAGE || "spa";
    workerPromise = createWorker(lang, 1, {
      logger: () => {}, // suppress progress logs
    });
  }
  return workerPromise;
}

/**
 * Recognize text from an image buffer.
 * @param imageBuffer Buffer or Uint8Array of the image
 * @param mimeType MIME type (image/png, image/jpeg)
 * @returns Extracted text
 */
export async function recognizeText(
  imageBuffer: Uint8Array,
  _mimeType: string = "image/png",
): Promise<string> {
  const worker = await getWorker();
  const { data } = await worker.recognize(imageBuffer as unknown as Blob);
  return data.text;
}

/**
 * Terminate the Tesseract worker (cleanup).
 */
export async function terminateWorker(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}
