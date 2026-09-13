import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date string to a human-readable format.
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("es-CL", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format bytes to human-readable size.
 */
export function formatBytes(bytes: number | undefined | null): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format a confidence value (0-1) as a percentage string.
 */
export function formatConfidence(confidence: number | undefined | null): string {
  if (confidence == null) return "—";
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Get a Tailwind text color class based on confidence level.
 */
export function confidenceColor(confidence: number | undefined | null): string {
  if (confidence == null) return "text-muted-foreground";
  if (confidence >= 0.85) return "text-green-600";
  if (confidence >= 0.7) return "text-yellow-600";
  return "text-red-600";
}
