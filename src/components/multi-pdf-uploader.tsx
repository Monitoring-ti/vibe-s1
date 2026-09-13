"use client";
import { useCallback, useState } from "react";
import { Upload, FileText, AlertCircle, Sparkles, X, Loader2, CheckCircle } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";

interface UploadedFile {
  file: File;
  id: string;
  preview: string;
  status: "pending" | "uploading" | "processing" | "done" | "error";
  error?: string;
  documentId?: string;
}

interface MultiPdfUploaderProps {
  onFilesUploaded: (files: File[]) => Promise<void>;
  maxSizeMB?: number;
  maxFiles?: number;
  disabled?: boolean;
}

export function MultiPdfUploader({
  onFilesUploaded,
  maxSizeMB = 20,
  maxFiles = 10,
  disabled = false,
}: MultiPdfUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files);
      validateAndAddFiles(files);
    },
    [disabled],
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    validateAndAddFiles(files);
    e.target.value = "";
  };

  function validateAndAddFiles(files: File[]) {
    setGlobalError(null);
    const validFiles: UploadedFile[] = [];

    for (const file of files) {
      if (uploadedFiles.length + validFiles.length >= maxFiles) {
        setGlobalError(`Máximo ${maxFiles} archivos permitidos`);
        break;
      }

      if (file.type !== "application/pdf") {
        setGlobalError(`"${file.name}" no es un PDF`);
        continue;
      }

      if (file.size > maxSizeMB * 1024 * 1024) {
        setGlobalError(`"${file.name}" excede ${maxSizeMB} MB`);
        continue;
      }

      const preview = URL.createObjectURL(file);
      validFiles.push({
        file,
        id: crypto.randomUUID(),
        preview,
        status: "pending",
      });
    }

    setUploadedFiles((prev) => [...prev, ...validFiles]);
  }

  const removeFile = useCallback((id: string) => {
    setUploadedFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file) URL.revokeObjectURL(file.preview);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    uploadedFiles.forEach((f) => URL.revokeObjectURL(f.preview));
    setUploadedFiles([]);
  }, [uploadedFiles]);

  const handleProcess = async () => {
    if (uploadedFiles.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setGlobalError(null);

    try {
      // Filter only pending files
      const pendingFiles = uploadedFiles.filter((f) => f.status === "pending");
      if (pendingFiles.length === 0) {
        setIsProcessing(false);
        return;
      }

      // Upload all files first
      for (let i = 0; i < pendingFiles.length; i++) {
        const uf = pendingFiles[i];
        setUploadedFiles((prev) =>
          prev.map((f) => (f.id === uf.id ? { ...f, status: "uploading" } : f)),
        );
      }

      // Call the parent callback with all valid files
      await onFilesUploaded(pendingFiles.map((f) => f.file));

      // Mark all as done
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.status === "uploading" ? { ...f, status: "done" } : f,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al procesar";
      setGlobalError(msg);
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.status === "uploading" ? { ...f, status: "error", error: msg } : f,
        ),
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const pendingCount = uploadedFiles.filter((f) => f.status === "pending").length;
  const doneCount = uploadedFiles.filter((f) => f.status === "done").length;
  const errorCount = uploadedFiles.filter((f) => f.status === "error").length;

  return (
    <div className="w-full space-y-4">
      {/* VIBE-style drag & drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed p-8 transition-all duration-300",
          isDragging
            ? "border-primary bg-primary/8 shadow-vibe scale-[1.01]"
            : "border-border bg-surface-lowest hover:border-primary/40 hover:bg-primary/3",
          disabled && "opacity-50 cursor-not-allowed",
        )}
        onClick={() => !disabled && document.getElementById("multi-pdf-upload-input")?.click()}
      >
        <input
          id="multi-pdf-upload-input"
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={handleFileInput}
          disabled={disabled}
        />

        {/* Animated gradient ring around icon */}
        <div
          className={cn(
            "mb-4 flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300",
            isDragging
              ? "bg-primary text-primary-foreground animate-pulse-glow"
              : "bg-primary/10 text-primary",
          )}
        >
          <Upload className="h-7 w-7" />
        </div>

        <p className="text-base font-semibold text-foreground">
          {isDragging
            ? `Suelta ${maxFiles - uploadedFiles.length} PDFs aquí`
            : `Arrastra PDFs o haz clic para seleccionar (máx. ${maxFiles})`}
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Máximo {maxSizeMB} MB cada uno · Solo archivos PDF
        </p>

        {/* VIBE tagline */}
        <div className="mt-4 flex items-center gap-1.5 rounded-full bg-primary/8 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="h-3 w-3" />
          Procesado con IA VIBE Safety
        </div>
      </div>

      {/* Global error */}
      {globalError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {globalError}
        </div>
      )}

      {/* File list */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-label-lg text-foreground">
              Archivos ({uploadedFiles.length}/{maxFiles})
            </h3>
            {doneCount > 0 && (
              <span className="font-label-sm text-tertiary">
                {doneCount} listo{doneCount !== 1 ? "s" : ""}
              </span>
            )}
            {errorCount > 0 && (
              <span className="font-label-sm text-destructive">
                {errorCount} error{errorCount !== 1 ? "es" : ""}
              </span>
            )}
            {uploadedFiles.length > 0 && (
              <button
                onClick={clearAll}
                disabled={isProcessing}
                className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                Limpiar todo
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {uploadedFiles.map((uf) => (
              <div
                key={uf.id}
                className={cn(
                  "flex items-center justify-between rounded-xl border p-3 shadow-vibe-sm vibe-card-hover transition-all duration-200",
                  uf.status === "uploading" && "border-primary/30 bg-primary/3",
                  uf.status === "processing" && "border-secondary/30 bg-secondary/3",
                  uf.status === "done" && "border-tertiary/30 bg-tertiary/3",
                  uf.status === "error" && "border-destructive/30 bg-destructive/3",
                )}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    uf.status === "uploading" && "bg-primary/10 text-primary",
                    uf.status === "processing" && "bg-secondary/10 text-secondary",
                    uf.status === "done" && "bg-tertiary/10 text-tertiary",
                    uf.status === "error" && "bg-destructive/10 text-destructive",
                    uf.status === "pending" && "bg-surface-container text-muted-foreground",
                  )}>
                    {uf.status === "uploading" && <Loader2 className="h-5 w-5 animate-spin" />}
                    {uf.status === "processing" && <Sparkles className="h-5 w-5 animate-pulse" />}
                    {uf.status === "done" && <CheckCircle className="h-5 w-5" />}
                    {uf.status === "error" && <AlertCircle className="h-5 w-5" />}
                    {(uf.status === "pending" || uf.status === "done") && (
                      <FileText className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {uf.file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(uf.file.size)}
                      {uf.status === "uploading" && " · Subiendo..."}
                      {uf.status === "processing" && " · Procesando con IA..."}
                      {uf.status === "done" && " · Listo para procesar"}
                      {uf.status === "error" && ` · Error: ${uf.error}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(uf.id);
                  }}
                  disabled={isProcessing || uf.status === "uploading" || uf.status === "processing"}
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
                  aria-label="Eliminar archivo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Process button */}
          {pendingCount > 0 && (
            <button
              onClick={handleProcess}
              disabled={isProcessing || disabled}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold text-primary-foreground transition-all vibe-hero-gradient vibe-hero-gradient-hover shadow-vibe disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Procesando {uploadedFiles.filter(f => f.status === 'uploading').length} archivo{uploadedFiles.filter(f => f.status === 'uploading').length !== 1 ? 's' : ''}...
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  Procesar {pendingCount} archivo{pendingCount !== 1 ? "s" : ""} con IA
                </>
              )}
            </button>
          )}

          {pendingCount === 0 && uploadedFiles.length > 0 && doneCount === uploadedFiles.length && (
            <div className="flex items-center justify-center gap-2 rounded-xl bg-tertiary/5 px-4 py-3 text-sm font-medium text-tertiary">
              <CheckCircle className="h-4 w-4" />
              Todos los archivos listos. Pulsa &laquo;Procesar&raquo; en la cola para iniciar.
            </div>
          )}
        </div>
      )}
    </div>
  );
}