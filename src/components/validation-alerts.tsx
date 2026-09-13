'use client';

import * as React from 'react';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  UserX,
  FileWarning,
  PenSquare,
  ShieldAlert,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ValidationAlert } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ValidationAlertsProps {
  alerts: ValidationAlert[];
  onResolve?: (alertId: string) => void;
  onJumpTo?: (talkId?: string) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Alert type icon mapping
// ---------------------------------------------------------------------------
const ALERT_ICONS: Record<string, React.ElementType> = {
  name_not_found: UserX,
  schedule_conflict: Clock,
  missing_field: FileWarning,
  low_confidence: ShieldAlert,
  unreadable_signature: PenSquare,
};

const ALERT_LABELS: Record<string, string> = {
  name_not_found: 'Nombre no encontrado',
  schedule_conflict: 'Conflicto de horario',
  missing_field: 'Campo faltante',
  low_confidence: 'Baja confianza',
  unreadable_signature: 'Firma ilegible',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ValidationAlerts({
  alerts,
  onResolve,
  onJumpTo,
  className,
}: ValidationAlertsProps) {
  // Sort: errors first, then warnings, then resolved
  const sorted = React.useMemo(() => {
    return [...alerts].sort((a, b) => {
      // Unresolved first
      if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
      // Errors before warnings
      if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
      return 0;
    });
  }, [alerts]);

  const errorCount = alerts.filter((a) => a.severity === 'error' && !a.resolved).length;
  const warningCount = alerts.filter((a) => a.severity === 'warning' && !a.resolved).length;
  const resolvedCount = alerts.filter((a) => a.resolved).length;

  if (alerts.length === 0) {
    return (
      <div className={cn('rounded-lg border border-green-200 bg-green-50 p-4', className)}>
        <div className="flex items-center gap-2 text-green-700">
          <CheckCircle2 className="h-5 w-5" />
          <span className="text-sm font-medium">Sin alertas de validación</span>
        </div>
        <p className="text-xs text-green-600 mt-1">Todos los datos validados correctamente.</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm">
        {errorCount > 0 && (
          <span className="flex items-center gap-1.5 text-red-600 font-medium">
            <XCircle className="h-4 w-4" />
            {errorCount} error{errorCount !== 1 ? 'es' : ''}
          </span>
        )}
        {warningCount > 0 && (
          <span className="flex items-center gap-1.5 text-yellow-600 font-medium">
            <AlertTriangle className="h-4 w-4" />
            {warningCount} advertencia{warningCount !== 1 ? 's' : ''}
          </span>
        )}
        {resolvedCount > 0 && (
          <span className="flex items-center gap-1.5 text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            {resolvedCount} resuelta{resolvedCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Alert list */}
      <div className="space-y-2">
        {sorted.map((alert) => {
          const Icon = ALERT_ICONS[alert.alert_type ?? ''] ?? AlertCircle;
          const isError = alert.severity === 'error';
          const isResolved = alert.resolved;

          return (
            <div
              key={alert.id}
              className={cn(
                'flex items-start gap-3 rounded-md border p-3 transition-opacity',
                isError
                  ? isResolved
                    ? 'border-green-200 bg-green-50/50 opacity-60'
                    : 'border-red-200 bg-red-50'
                  : isResolved
                    ? 'border-green-200 bg-green-50/50 opacity-60'
                    : 'border-yellow-200 bg-yellow-50',
              )}
            >
              {/* Icon */}
              <div className="flex-shrink-0 mt-0.5">
                <Icon
                  className={cn(
                    'h-4 w-4',
                    isError ? 'text-red-500' : 'text-yellow-500',
                    isResolved && 'text-green-500',
                  )}
                />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-xs font-semibold uppercase tracking-wide',
                      isError ? 'text-red-600' : 'text-yellow-600',
                      isResolved && 'text-green-600',
                    )}
                  >
                    {ALERT_LABELS[alert.alert_type ?? '']}
                  </span>
                  <span
                    className={cn(
                      'text-xs px-1.5 py-0.5 rounded-full',
                      isError ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700',
                      isResolved && 'bg-green-100 text-green-700',
                    )}
                  >
                    {alert.severity === 'error' ? 'Error' : 'Advertencia'}
                  </span>
                  {isResolved && (
                    <span className="text-xs text-green-600 flex items-center gap-0.5">
                      <CheckCircle2 className="h-3 w-3" /> Resuelto
                    </span>
                  )}
                </div>
                <p className="text-sm mt-0.5">{alert.message}</p>
              </div>

              {/* Actions */}
              <div className="flex-shrink-0 flex items-center gap-1">
                {alert.talk_id && onJumpTo && !isResolved && (
                  <button
                    onClick={() => onJumpTo(alert.talk_id)}
                    className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
                    aria-label="Ir a la charla"
                  >
                    Ir
                    <ChevronRight className="h-3 w-3" />
                  </button>
                )}
                {!isResolved && onResolve && (
                  <button
                    onClick={() => onResolve(alert.id)}
                    className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Resolver
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
