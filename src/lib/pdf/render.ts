/**
 * Renderiza páginas de un PDF a imágenes JPEG (base64) usando pdf.js en el navegador.
 * Optimizado para el límite de payload de Vercel (4.5 MB/request):
 * - escala 1.5 (~108 DPI, suficiente para lectura por visión)
 * - JPEG calidad 0.85 (3-5x más liviano que PNG)
 * - presupuesto total de ~3 MB; si lo excede, re-renderiza a menor escala/calidad
 */
import * as pdfjsLib from "pdfjs-dist";
import type { RenderedPage } from "@/types";

// Worker de pdf.js desde CDN (misma versión que el paquete)
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

const MAX_PAGES = 10;
// Presupuesto total en base64 (~3 MB, margen bajo el límite de 4.5 MB)
const TOTAL_BUDGET = 3 * 1024 * 1024;

interface RenderConfig {
  scale: number;
  quality: number;
}

export async function renderPdfToImages(
  file: File,
  maxPages: number = MAX_PAGES,
): Promise<RenderedPage[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const pageCount = Math.min(pdf.numPages, maxPages);

  // Empezar con calidad alta; si excede el presupuesto, bajar
  let config: RenderConfig = { scale: 1.5, quality: 0.85 };

  for (let attempt = 0; attempt < 4; attempt++) {
    const pages = await renderWithConfig(pdf, pageCount, config);
    const total = pages.reduce((s, p) => s + p.base64.length, 0);

    if (total <= TOTAL_BUDGET) {
      return pages;
    }

    // Escalón de degradación: escala y calidad más bajas
    config = {
      scale: Math.max(1.0, config.scale - 0.25),
      quality: Math.max(0.5, config.quality - 0.15),
    };
  }

  // Último intento con config mínima, sin importar el tamaño
  return renderWithConfig(pdf, pageCount, { scale: 1.0, quality: 0.5 });
}

async function renderWithConfig(
  pdf: { numPages: number; getPage: (n: number) => Promise<any> },
  pageCount: number,
  config: RenderConfig,
): Promise<RenderedPage[]> {
  const pages: RenderedPage[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: config.scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo crear el canvas para renderizar");

    // Fondo blanco (JPEG no soporta transparencia)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    const dataUrl = canvas.toDataURL("image/jpeg", config.quality);
    const base64 = dataUrl.split(",")[1];

    pages.push({
      pageNumber: i,
      base64,
      width: Math.round(viewport.width),
      height: Math.round(viewport.height),
    });

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