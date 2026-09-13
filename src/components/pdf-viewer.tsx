"use client";
import { FileText, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface PdfViewerProps {
  fileUrl?: string;
  fileName?: string;
  className?: string;
}

export function PdfViewer({ fileUrl, fileName, className }: PdfViewerProps) {
  const [zoom, setZoom] = useState(100);

  if (!fileUrl) {
    return (
      <div className={cn("flex h-full items-center justify-center rounded-lg bg-surface-low", className)}>
        <div className="text-center">
          <FileText className="mx-auto mb-3 h-14 w-14 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            Vista previa del PDF no disponible
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full bg-surface-low", className)}>
      {/* VIBE toolbar */}
      <div className="flex items-center justify-between border-b border-border bg-surface-lowest px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary flex-shrink-0">
            <FileText className="h-4 w-4" />
          </div>
          <span className="text-sm font-medium truncate max-w-[200px] text-foreground">
            {fileName || "documento.pdf"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.max(50, z - 10))}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{zoom}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(200, z + 10))}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <div className="h-4 w-px bg-border mx-1" />
          <button
            onClick={() => setZoom(100)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
            title="Restablecer zoom"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* PDF iframe */}
      <div className="flex-1 overflow-auto bg-surface p-3">
        <iframe
          src={fileUrl}
          title="PDF Preview"
          style={{ width: `${zoom}%`, height: "100%", margin: "0 auto" }}
          className="rounded-lg border-0 bg-white shadow-sm"
        />
      </div>
    </div>
  );
}
