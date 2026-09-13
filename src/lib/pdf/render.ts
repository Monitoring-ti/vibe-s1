/**
 * Renderiza páginas de un PDF a imágenes PNG (base64) usando pdf.js en el navegador.
 * Se llama antes de subir el PDF: el usuario "paga" el costo de renderizado con su CPU,
 * y la Edge Function solo recibe imágenes listas para el modelo de visión.
 */
import * as pdfjsLib from "pdfjs-dist";
import type { RenderedPage } from "@/types";

// Worker de pdf.js desde CDN (misma versión que el paquete)
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

const RENDER_SCALE = 2.0; // 2x = ~144 DPI, suficiente para OCR por visión
const MAX_PAGES = 10; // límite por documento

export async function renderPdfToImages(
  file: File,
  maxPages: number = MAX_PAGES,
): Promise<RenderedPage[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const pageCount = Math.min(pdf.numPages, maxPages);
  const pages: RenderedPage[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);

    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo crear el canvas para renderizar");

    await page.render({ canvasContext: ctx, viewport }).promise;

    // PNG en base64 (sin el prefijo data: — se agrega al enviar al modelo)
    const dataUrl = canvas.toDataURL("image/png");
    const base64 = dataUrl.split(",")[1];

    pages.push({
      pageNumber: i,
      base64,
      width: Math.round(viewport.width),
      height: Math.round(viewport.height),
    });

    // liberar memoria del canvas
    canvas.width = 0;
    canvas.height = 0;
  }

  return pages;
}

export async function getPdfPageCount(file: File): Promise<number> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  return pdf.numPages;
}
