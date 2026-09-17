"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, FileText, AlertCircle, X, Loader2,
  CheckCircle, Eye, ChevronLeft, ChevronRight, FileCheck, Workflow,
} from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { getPdfPageCount } from "@/lib/pdf/render";

interface UploadItem {
  file: File;
  id: string;
  status: "pending" | "uploading" | "processing" | "done" | "error";
  error?: string;
  pageCount?: number;
  previewUrl: string;
  jobId?: string;
}

interface JobStatus {
  estado: string;
  error_mensaje: string | null;
  talks: number;
  docs: number;
}

const MAX_POLL_MS = 5 * 60 * 1000; // 5 minutos máx de polling

export function AnalyzeUploader({ maxSizeMB = 20, maxFiles = 5 }) {
  const [isDragging, setIsDragging] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [confirmItem, setConfirmItem] = useState<UploadItem | null>(null);
  const [confirmPage, setConfirmPage] = useState(1);
  const pollTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const router = useRouter();

  // Limpieza de timers al desmontar
  useEffect(() => {
    const timers = pollTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    for (const item of items) {
      if (item.pageCount === undefined) {
        getPdfPageCount(item.file)
          .then((n) =>
            setItems((prev) =>
              prev.map((i) => (i.id === item.id ? { ...i, pageCount: n } : i)),
            ),
          )
          .catch(() =>
            setItems((prev) =>
              prev.map((i) => (i.id === item.id ? { ...i, pageCount: -1 } : i)),
            ),
          );
      }
    }
  }, [items]);

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
        valid.push({
          file,
          id: crypto.randomUUID(),
          status: "pending",
          previewUrl: URL.createObjectURL(file),
        });
      }
      setItems((prev) => [...prev, ...valid].slice(0, maxFiles));
    },
    [maxSizeMB, maxFiles],
  );

  const removeItem = (id: string) => {
    setItems((prev) => {
      const f = prev.find((i) => i.id === id);
      if (f) URL.revokeObjectURL(f.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
    if (confirmItem?.id === id) setConfirmItem(null);
  };

  const openPreview = (item: UploadItem) => {
    setConfirmItem(item);
    setConfirmPage(1);
  };

  const startPolling = (uploadItem: UploadItem, jobId: string) => {
    const startedAt = Date.now();

    const poll = async () => {
      try {
        const res = await fetch(`/api/job-status?id=${jobId}`);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "Error de estado");

        const estado = data.job.estado as string;

        if (estado === "completado" || estado === "requiere_revision") {
          setItems((prev) =>
            prev.map((i) => (i.id === uploadItem.id ? { ...i, status: "done" } : i)),
          );
          router.push("/dashboard/resultados");
          return;
        }

        if (estado === "error") {
          setItems((prev) =>
            prev.map((i) =>
              i.id === uploadItem.id
                ? { ...i, status: "error", error: data.job.error_mensaje || "Error en n8n" }
                : i,
            ),
          );
          return;
        }

        // Sigue procesando
        if (Date.now() - startedAt > MAX_POLL_MS) {
          setItems((prev) =>
            prev.map((i) =>
              i.id === uploadItem.id
                ? { ...i, status: "error", error: "Timeout: n8n tardó más de 5 minutos" }
                : i,
            ),
          );
          return;
        }

        const timer = setTimeout(poll, 3000);
        pollTimers.current.push(timer);
      } catch {
        const timer = setTimeout(poll, 5000);
        pollTimers.current.push(timer);
      }
    };

    poll();
  };

  const confirmAndProcess = () => {
    if (!confirmItem) return;
    const target = confirmItem;
    setConfirmItem(null);
    submitToN8n(target);
  };

  const submitToN8n = async (item: UploadItem) => {
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: "uploading" } : i)),
    );

    try {
      const formData = new FormData();
      formData.append("file", item.file);

      const res = await fetch("/api/submit", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Error al enviar");

      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, status: "processing", jobId: data.jobId } : i,
        ),
      );

      startPolling(item, data.jobId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error de red";
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, status: "error", error: msg } : i,
        ),
      );
    }
  };

  const isBusy = (s: UploadItem["status"]) => s === "uploading" || s === "processing";

  return (
    <div className="w-full space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
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
          PDF hasta {maxSizeMB} MB · máx. {maxFiles} archivos · procesa vía n8n
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
                !isBusy(item.status) && item.status !== "error" && item.status !== "done" &&
                  "border-outline-variant bg-surface-container-lowest",
                isBusy(item.status) && "border-primary/30 bg-primary/5",
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-container">
                  {isBusy(item.status) ? (
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
                    {item.pageCount !== undefined && item.pageCount > 0 && ` · ${item.pageCount} pág.`}
                    {item.status === "uploading" && " · Enviando a n8n..."}
                    {item.status === "processing" && " · Procesando en n8n (extracción IA)..."}
                    {item.status === "done" && " · Completado"}
                    {item.status === "error" && ` · ${item.error}`}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {item.status === "pending" && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); openPreview(item); }}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      <Eye className="h-4 w-4" />
                      Verificar
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ════ Modal de verificación ════ */}
      {confirmItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setConfirmItem(null)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-elevation-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-headline-sm text-on-surface">
                    {confirmItem.file.name}
                  </p>
                  <p className="font-label-sm text-on-surface-variant">
                    {formatBytes(confirmItem.file.size)}
                    {confirmItem.pageCount !== undefined && confirmItem.pageCount > 0 &&
                      ` · ${confirmItem.pageCount} página${confirmItem.pageCount !== 1 ? "s" : ""}`}
                    {" · Verifica que sea el acta correcta"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setConfirmItem(null)}
                className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container-high"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-surface-container-low p-4">
              <iframe
                src={`${confirmItem.previewUrl}#page=${confirmPage}&toolbar=0&navpanes=0&view=FitH`}
                className="h-[55vh] w-full rounded-xl border border-outline-variant bg-white"
                title="Vista previa del PDF"
              />
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-outline-variant px-5 py-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setConfirmPage((p) => Math.max(1, p - 1))}
                  disabled={confirmPage <= 1}
                  className="flex items-center gap-1 rounded-full border border-outline-variant px-3 py-1.5 font-label-md text-on-surface disabled:opacity-40 hover:bg-surface-container-high"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </button>
                <span className="font-label-md text-on-surface-variant">
                  Página {confirmPage}
                  {confirmItem.pageCount && confirmItem.pageCount > 0
                    ? ` de ${confirmItem.pageCount}`
                    : ""}
                </span>
                <button
                  onClick={() => setConfirmPage((p) => p + 1)}
                  disabled={
                    confirmItem.pageCount !== undefined &&
                    confirmItem.pageCount > 0 &&
                    confirmPage >= confirmItem.pageCount
                  }
                  className="flex items-center gap-1 rounded-full border border-outline-variant px-3 py-1.5 font-label-md text-on-surface disabled:opacity-40 hover:bg-surface-container-high"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setConfirmItem(null)}
                  className="rounded-full border border-outline-variant px-5 py-2.5 font-label-lg text-on-surface hover:bg-surface-container-high"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmAndProcess}
                  className="flex items-center gap-2 rounded-full bg-hero-gradient px-5 py-2.5 font-label-lg font-semibold text-white shadow-elevation-2 transition-transform hover:scale-[1.02]"
                >
                  <Workflow className="h-4 w-4" />
                  Confirmar y procesar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}