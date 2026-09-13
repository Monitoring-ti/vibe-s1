'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Edit2, Save, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatConfidence, confidenceColor } from '@/lib/utils';
import type { TalkParticipant } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ParticipantEditorProps {
  talkId: string;
  participants: TalkParticipant[];
  onUpdate?: (participantId: string, updates: Partial<TalkParticipant>) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ParticipantEditor({
  talkId,
  participants,
  onUpdate,
  className,
}: ParticipantEditorProps) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState('');

  const startEdit = (p: TalkParticipant) => {
    setEditingId(p.id);
    setEditValue(p.normalized_name);
  };

  const saveEdit = () => {
    if (editingId && onUpdate) {
      onUpdate(editingId, { normalized_name: editValue });
    }
    setEditingId(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  if (participants.length === 0) {
    return (
      <div className={cn('rounded-lg border p-4 text-center', className)}>
        <p className="text-sm text-muted-foreground">
          No hay participantes para esta charla.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold">Participantes ({participants.length})</h4>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            {participants.filter((p) => p.name_matches_nomina).length} en nómina
          </span>
          <span className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-yellow-500" />
            {participants.filter((p) => !p.name_matches_nomina).length} sin coincidencia
          </span>
        </div>
      </div>

      {/* Participant list */}
      <div className="space-y-1.5">
        {participants.map((p) => {
          const isEditing = editingId === p.id;
          const hasMismatch = !p.name_matches_nomina;
          const hasLowConfidence = p.confidence_score < 0.7;

          return (
            <div
              key={p.id}
              className={cn(
                'flex items-start gap-3 rounded-md border p-3 transition-colors',
                hasMismatch ? 'border-yellow-200 bg-yellow-50/30' : 'border-border',
              )}
            >
              {/* Signature checkbox */}
              <div className="flex-shrink-0 pt-0.5">
                <input
                  type="checkbox"
                  checked={p.signature_detected}
                  onChange={(e) => onUpdate?.(p.id, { signature_detected: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                  aria-label="Firma detectada"
                />
              </div>

              {/* Name info */}
              <div className="flex-1 min-w-0 space-y-1">
                {/* Detected name */}
                <div>
                  <span className="text-xs text-muted-foreground">Detectado: </span>
                  <span className="text-xs text-muted-foreground italic">{p.detected_name}</span>
                </div>

                {/* Normalized name (editable) */}
                <div>
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="flex-1 rounded-md border border-primary px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        autoFocus
                      />
                      <button onClick={saveEdit} className="text-green-600 hover:text-green-700">
                        <Save className="h-4 w-4" />
                      </button>
                      <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{p.normalized_name}</span>
                      <button
                        onClick={() => startEdit(p)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Editar nombre"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* RUT */}
                {p.rut && (
                  <div>
                    <span className="text-xs text-muted-foreground">RUT: </span>
                    <span className="text-xs">{p.rut}</span>
                  </div>
                )}

                {/* Confidence */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Confianza:</span>
                  <span className={cn('text-xs font-semibold tabular-nums', confidenceColor(p.confidence_score))}>
                    {formatConfidence(p.confidence_score)}
                  </span>
                  {p.nomina_match_score !== null && p.nomina_match_score !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      (nómina: {formatConfidence(p.nomina_match_score)})
                    </span>
                  )}
                </div>

                {/* Alerts */}
                {hasMismatch && (
                  <div className="flex items-start gap-1.5 text-xs text-yellow-700 bg-yellow-100 rounded px-2 py-1 mt-1">
                    <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span>
                      El nombre no coincide con nómina. Mejor coincidencia: {formatConfidence(p.nomina_match_score ?? 0)}.
                      Verifica y corrige si es necesario.
                    </span>
                  </div>
                )}
                {hasLowConfidence && (
                  <div className="flex items-start gap-1.5 text-xs text-orange-700 bg-orange-100 rounded px-2 py-1 mt-1">
                    <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span>Baja confianza en la detección. Revisar manualmente.</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
