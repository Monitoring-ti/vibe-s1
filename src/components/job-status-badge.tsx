'use client';

import * as React from 'react';
import {
  Clock,
  Upload,
  ScanLine,
  Brain,
  ShieldCheck,
  FileOutput,
  Eye,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { JobStatus } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface JobStatusBadgeProps {
  status: JobStatus;
  className?: string;
  showIcon?: boolean;
}

// ---------------------------------------------------------------------------
// Status configuration — VIBE Safety AI color system
//   primary   → active / in-progress (blue)
//   secondary → alerts / attention (amber)
//   tertiary  → confirmed / success (green)
//   destructive → failed (red)
//   muted     → pending / idle (neutral)
// ---------------------------------------------------------------------------
const STATUS_CONFIG: Record<
  JobStatus,
  {
    label: string;
    className: string;
    dotColor: string;
    icon: React.ElementType;
  }
> = {
  pending: {
    label: 'Pendiente',
    className: 'bg-surface-low text-muted-foreground border-border',
    dotColor: 'bg-muted-foreground/40',
    icon: Clock,
  },
  uploading: {
    label: 'Subiendo',
    className: 'bg-primary/10 text-primary border-primary/20',
    dotColor: 'bg-primary',
    icon: Upload,
  },
  extracting: {
    label: 'Extrayendo',
    className: 'bg-primary/10 text-primary border-primary/20',
    dotColor: 'bg-primary',
    icon: ScanLine,
  },
  ocr: {
    label: 'OCR',
    className: 'bg-primary/10 text-primary border-primary/20',
    dotColor: 'bg-primary',
    icon: ScanLine,
  },
  hermes: {
    label: 'Procesando IA',
    className: 'bg-primary/10 text-primary border-primary/20',
    dotColor: 'bg-primary',
    icon: Brain,
  },
  validating: {
    label: 'Validando',
    className: 'bg-primary/10 text-primary border-primary/20',
    dotColor: 'bg-primary',
    icon: ShieldCheck,
  },
  generating: {
    label: 'Generando',
    className: 'bg-primary/10 text-primary border-primary/20',
    dotColor: 'bg-primary',
    icon: FileOutput,
  },
  review: {
    label: 'En revisión',
    className: 'bg-secondary/15 text-secondary border-secondary/30',
    dotColor: 'bg-secondary',
    icon: Eye,
  },
  completed: {
    label: 'Completado',
    className: 'bg-tertiary/15 text-tertiary border-tertiary/30',
    dotColor: 'bg-tertiary',
    icon: CheckCircle2,
  },
  failed: {
    label: 'Fallido',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
    dotColor: 'bg-destructive',
    icon: XCircle,
  },
  // Spanish aliases from DB
  pendiente: {
    label: 'Pendiente',
    className: 'bg-surface-low text-muted-foreground border-border',
    dotColor: 'bg-muted-foreground/40',
    icon: Clock,
  },
  procesando: {
    label: 'Procesando',
    className: 'bg-primary/10 text-primary border-primary/20',
    dotColor: 'bg-primary',
    icon: Upload,
  },
  requiere_revision: {
    label: 'En revisión',
    className: 'bg-secondary/15 text-secondary border-secondary/30',
    dotColor: 'bg-secondary',
    icon: Eye,
  },
  completado: {
    label: 'Completado',
    className: 'bg-tertiary/15 text-tertiary border-tertiary/30',
    dotColor: 'bg-tertiary',
    icon: CheckCircle2,
  },
  error: {
    label: 'Error',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
    dotColor: 'bg-destructive',
    icon: XCircle,
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function JobStatusBadge({ status, className, showIcon = true }: JobStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const isProcessing =
    status === 'extracting' ||
    status === 'ocr' ||
    status === 'hermes' ||
    status === 'validating' ||
    status === 'generating';
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        config.className,
        className,
      )}
    >
      {showIcon && (
        <Icon
          className={cn(
            'h-3.5 w-3.5',
            isProcessing && 'animate-pulse',
          )}
        />
      )}
      {config.label}
    </span>
  );
}
