"use client";
import { useCallback, useState } from "react";
import { Upload, FileText, AlertCircle, Sparkles } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";

interface PdfUploaderProps {
  onFileSelected: (file: File) => void;
  maxSizeMB?: number;
}

export function PdfUploader({ onFileSelected, maxSizeMB = 20 }: PdfUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) validateAndSet(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSet(file);
  };

  function validateAndSet(file: File) {
    setError(null);
    if (file.type !== "application/pdf") {
      setError("El archivo debe ser un PDF");
      return;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`El archivo excede el tamaño máximo de ${maxSizeMB} MB`);
      return;
    }
    setSelectedFile(file);
    onFileSelected(file);
  }

  return (
    <div className="w-full">
      {/* VIBE-style drag & drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative flex min-h-[240px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed p-8 transition-all duration-300",
          isDragging
            ? "border-primary bg-primary/8 shadow-vibe scale-[1.01]"
            : "border-border bg-surface-lowest hover:border-primary/40 hover:bg-primary/3",
        )}
        onClick={() => document.getElementById("pdf-upload-input")?.click()}
      >
        <input
          id="pdf-upload-input"
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileInput}
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
          {isDragging ? "Suelta el PDF aquí" : "Arrastra un PDF o haz clic para seleccionar"}
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Máximo {maxSizeMB} MB · Solo archivos PDF
        </p>

        {/* VIBE tagline */}
        <div className="mt-4 flex items-center gap-1.5 rounded-full bg-primary/8 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="h-3 w-3" />
          Procesado con IA VIBE Safety
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Selected file — VIBE card style */}
      {selectedFile && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-surface-lowest p-4 shadow-vibe vibe-card-hover">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)}</p>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFileSelected(selectedFile);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground transition-all vibe-hero-gradient vibe-hero-gradient-hover shadow-vibe"
          >
            <Upload className="h-4 w-4" />
            Procesar
          </button>
        </div>
      )}
    </div>
  );
}
