"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, AlertCircle, Sparkles, X, Loader2, CheckCircle } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { renderPdfToImages } from "@/lib/pdf/render";

interface UploadItem {
  file: File;
  id: string;
  status: "pending" | "rendering" | "analyzing" | "done" | "error";
  error?: string;
}

export function AnalyzeUploader({ maxSizeMB = 20, maxFiles = 5 }) {
  const [isDragging, setIsDragging] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const router = useRouter();

  const addFiles = useCallback(
    (files: File[]) => {
      setGlobalError(null);
      const valid: UploadItem[] = [];
      for (const file of files) {
        if (file.type !== "application/pdf") {
          setGlobalError(`"${file.name}" no es un PDF`);
          continue;
        }
        if (file.size > maxSizeMB * 1024 * 1024) {
          setGlobalError(`"${file.name}" excede ${maxSizeMB} MB`);
          continue;
        }
        valid.push({ file, id: crypto.randomUUID(), status: "pending" });
      }
      setItems((prev) => [...prev, ...valid].slice(0, maxFiles));
    },
    [maxSizeMB, maxFiles],
  );

  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((f) => f.id !== id));

  const processAll = async () => {
    const pending = items.filter((i) => i.status === "pending");
    if (pending.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setGlobalError(null);
    let anySuccess = false;

    for (const item of pending) {
      try {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "rendering" } : i)),
        );

        // 1. Renderizar páginas en el navegador
        const pages = await renderPdfToImages(item.file);

        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "analyzing" } : i)),
        );

        // 2. Enviar al Route Handler de análisis
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: item.file.name,
            pages: pages.map((p) => ({
              pageNumber: p.pageNumber,
              base64: p.base64,
            })),
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error del análisis");

        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "done" } : i)),
        );
        anySuccess = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error desconocido";
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, status: "error", error: msg } : i,
          ),
        );
      }
    }

    setIsProcessing(false);

    // Redirigir a resultados si al menos uno funcionó
    if (anySuccess) {
      router.push("/dashboard/resultados");
    }
  };

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const doneCount = items.filter((i) => i.status === "done").length;
  const processingCount = items.filter(
    (i) => i.status === "rendering" || i.status === "analyzing",
  ).length;

  return (
    <div className="w-full space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          addFiles(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 transition-all",
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-outline-variant bg-surface-container-lowest hover:border-primary/40",
        )}
        onClick={() => document.getElementById("analyze-upload-input")?.click()}
      >
        <input
          id="analyze-upload-input"
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(Array.from(e.target.files || []));
            e.target.value = "";
          }}
          disabled={isProcessing}
        />
        <div
          className={cn(
            "mb-3 flex h-14 w-14 items-center justify-center rounded-2xl",
            isDragging ? "bg-primary text-white" : "bg-primary/10 text-primary",
          )}
        >
          <Upload className="h-6 w-6" />
        </div>
        <p className="font-medium text-foreground">
          {isDragging ? "Suelta los PDFs aquí" : "Arrastra tus actas o haz clic"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          PDF hasta {maxSizeMB} MB · máx. {maxFiles} archivos
        </p>
      </div>

      {globalError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {globalError}
        </div>
      )}

      {/* Lista */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                "flex items-center justify-between rounded-xl border p-3",
                item.status === "error" && "border-destructive/30 bg-destructive/5",
                item.status === "done" && "border-tertiary/30 bg-tertiary/5",
                (item.status === "pending" || item.status === "rendering" || item.status === "analyzing") &&
                  "border-outline-variant bg-surface-container-lowest",
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-container">
                  {item.status === "rendering" || item.status === "analyzing" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : item.status === "done" ? (
                    <CheckCircle className="h-4 w-4 text-tertiary" />
                  ) : item.status === "error" ? (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(item.file.size)}
                    {item.status === "rendering" && " · Renderizando páginas..."}
                    {item.status === "analyzing" && " · Analizando con IA..."}
                    {item.status === "done" && " · Completado"}
                    {item.status === "error" && ` · ${item.error}`}
                  </p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeItem(item.id);
                }}
                disabled={isProcessing}
                className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          {pendingCount > 0 && (
            <button
              onClick={processAll}
              disabled={isProcessing}
              className="w-full rounded-xl bg-hero-gradient py-3 text-base font-semibold text-white shadow-elevation-2 transition-all hover:scale-[1.01] disabled:opacity-50"
            >
              {isProcessing ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Procesando {processingCount > 0 ? `${processingCount}...` : "..."}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  Analizar {pendingCount} documento{pendingCount !== 1 ? "s" : ""}
                </span>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}