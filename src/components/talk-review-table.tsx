'use client';

import * as React from 'react';
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  User,
  MapPin,
  MessageSquare,
  PenLine,
  ShieldCheck,
  Brain,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatConfidence, confidenceColor } from '@/lib/utils';
import type { SafetyTalk, TalkParticipant, ValidationAlert } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TalkReviewTableProps {
  talks: SafetyTalk[];
  participantsByTalk: Record<string, TalkParticipant[]>;
  alertsByTalk?: Record<string, ValidationAlert[]>;
  onTalkUpdate?: (talkId: string, updates: Partial<SafetyTalk>) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function TalkReviewTable({
  talks,
  participantsByTalk,
  alertsByTalk = {},
  onTalkUpdate,
  className,
}: TalkReviewTableProps) {
  const [expandedTalks, setExpandedTalks] = React.useState<Set<string>>(new Set());

  const toggleExpand = (talkId: string) => {
    setExpandedTalks((prev) => {
      const next = new Set(prev);
      if (next.has(talkId)) {
        next.delete(talkId);
      } else {
        next.add(talkId);
      }
      return next;
    });
  };

  if (talks.length === 0) {
    return (
      <div className={cn('rounded-xl border border-border bg-surface-lowest p-10 text-center shadow-sm', className)}>
        <Brain className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          No se detectaron charlas en los documentos procesados.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {talks.map((talk) => {
        const isExpanded = expandedTalks.has(talk.id);
        const participants = participantsByTalk[talk.id] ?? [];
        const alerts = alertsByTalk[talk.id] ?? [];
        const hasErrors = alerts.some((a) => a.severity === 'error' && !a.resolved);
        const hasWarnings = alerts.some((a) => a.severity === 'warning' && !a.resolved);

        return (
          <div
            key={talk.id}
            className={cn(
              'rounded-xl border overflow-hidden bg-surface-lowest shadow-sm transition-all',
              hasErrors
                ? 'border-destructive/30'
                : hasWarnings
                  ? 'border-secondary/40'
                  : 'border-border',
              !isExpanded && 'vibe-card-hover',
            )}
          >
            {/* Header row */}
            <div
              className="flex items-center gap-3 p-4 cursor-pointer hover:bg-surface-low/60 transition-colors"
              onClick={() => toggleExpand(talk.id)}
            >
              {/* Expand toggle */}
              <button className="flex-shrink-0">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {/* Course name + metadata */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {talk.course_name || '(sin nombre)'}
                  </span>
                  {talk.requires_review && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-secondary/30 bg-secondary/15 px-2 py-0.5 text-xs font-medium text-secondary">
                      <AlertTriangle className="h-3 w-3" />
                      Requiere revisión
                    </span>
                  )}
                  {hasErrors && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      {alerts.filter((a) => a.severity === 'error' && !a.resolved).length} error{alerts.filter((a) => a.severity === 'error' && !a.resolved).length !== 1 ? 'es' : ''}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {talk.talk_date}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {talk.talk_time} · {talk.duration_minutes}min
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {talk.instructor || 'N/A'}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {talk.talk_type}
                  </span>
                </div>
              </div>

              {/* Confidence display */}
              <div className="flex-shrink-0 flex items-center gap-3">
                <div className="text-right">
                  <div className={cn('text-sm font-bold tabular-nums', confidenceColor(talk.confidence_score))}>
                    {formatConfidence(talk.confidence_score)}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Confianza</div>
                </div>
                {/* Confidence dot */}
                <div
                  className={cn(
                    'h-2.5 w-2.5 rounded-full',
                    talk.confidence_score >= 0.85
                      ? 'bg-tertiary'
                      : talk.confidence_score >= 0.7
                        ? 'bg-secondary'
                        : 'bg-destructive',
                  )}
                />
              </div>

              {/* Participant count */}
              <div className="flex-shrink-0 text-right">
                <div className="text-sm font-semibold tabular-nums text-foreground">
                  {participants.length}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  Particip.
                </div>
              </div>
            </div>

            {/* Expanded content — VIBE editable cards */}
            {isExpanded && (
              <div className="border-t border-border bg-surface-low/50 p-4 space-y-4 animate-fade-in">
                {/* AI extraction indicator */}
                <div className="flex items-center gap-2 rounded-lg bg-primary/8 px-3 py-2 text-xs text-primary">
                  <Brain className="h-3.5 w-3.5" />
                  <span className="font-medium">Datos extraídos por IA</span>
                  <span className="text-muted-foreground">— Edita los campos si es necesario</span>
                </div>

                {/* Editable field cards grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <FieldCard
                    label="Nombre del curso"
                    value={talk.course_name}
                    confidence={talk.confidence_score}
                    onChange={(v) => onTalkUpdate?.(talk.id, { course_name: v })}
                  />
                  <FieldCard
                    label="Fecha"
                    type="date"
                    value={talk.talk_date}
                    confidence={talk.confidence_score}
                    onChange={(v) => onTalkUpdate?.(talk.id, { talk_date: v })}
                  />
                  <FieldCard
                    label="Hora"
                    type="time"
                    value={talk.talk_time}
                    confidence={talk.confidence_score}
                    onChange={(v) => onTalkUpdate?.(talk.id, { talk_time: v })}
                  />
                  <FieldCard
                    label="Duración (min)"
                    type="number"
                    value={String(talk.duration_minutes)}
                    confidence={talk.confidence_score}
                    onChange={(v) => onTalkUpdate?.(talk.id, { duration_minutes: parseInt(v) || 0 })}
                  />
                  <SelectCard
                    label="Tipo"
                    value={talk.talk_type}
                    confidence={talk.confidence_score}
                    options={[
                      { value: 'presencial', label: 'Presencial' },
                      { value: 'virtual', label: 'Virtual' },
                      { value: 'hibrido', label: 'Híbrido' },
                    ]}
                    onChange={(v) => onTalkUpdate?.(talk.id, { talk_type: v as SafetyTalk['talk_type'] })}
                  />
                  <SelectCard
                    label="Modalidad"
                    value={talk.modality}
                    confidence={talk.confidence_score}
                    options={[
                      { value: 'charla', label: 'Charla' },
                      { value: 'capacitacion', label: 'Capacitación' },
                      { value: 'induccion', label: 'Inducción' },
                      { value: 'otro', label: 'Otro' },
                    ]}
                    onChange={(v) => onTalkUpdate?.(talk.id, { modality: v as SafetyTalk['modality'] })}
                  />
                  <SelectCard
                    label="Idioma"
                    value={talk.language}
                    confidence={talk.confidence_score}
                    options={[
                      { value: 'es', label: 'Español' },
                      { value: 'en', label: 'Inglés' },
                      { value: 'pt', label: 'Portugués' },
                    ]}
                    onChange={(v) => onTalkUpdate?.(talk.id, { language: v as SafetyTalk['language'] })}
                  />
                  <FieldCard
                    label="Instructor"
                    value={talk.instructor}
                    confidence={talk.confidence_score}
                    onChange={(v) => onTalkUpdate?.(talk.id, { instructor: v })}
                  />
                </div>

                {/* Comments field */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1.5">
                    <MessageSquare className="h-3 w-3" />
                    Comentarios
                  </label>
                  <textarea
                    className="w-full rounded-lg border border-border bg-surface-lowest px-3 py-2 text-sm min-h-[60px] focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    value={talk.comments}
                    onChange={(e) => onTalkUpdate?.(talk.id, { comments: e.target.value })}
                  />
                </div>

                {/* Validation alerts for this talk */}
                {alerts.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Alertas de validación
                    </p>
                    {alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
                          alert.severity === 'error'
                            ? alert.resolved
                              ? 'border-tertiary/20 bg-tertiary/5 text-tertiary'
                              : 'border-destructive/20 bg-destructive/8 text-destructive'
                            : alert.resolved
                              ? 'border-tertiary/20 bg-tertiary/5 text-tertiary'
                              : 'border-secondary/30 bg-secondary/10 text-secondary',
                        )}
                      >
                        <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                        <span className="flex-1">{alert.message}</span>
                        {alert.resolved && (
                          <span className="text-tertiary flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Resuelto
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Participants — VIBE biometric detection card */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <PenLine className="h-3.5 w-3.5" />
                      Participantes ({participants.length})
                    </p>
                    {participants.length > 0 && (
                      <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1 text-tertiary">
                          <CheckCircle2 className="h-3 w-3" />
                          {participants.filter((p) => p.name_matches_nomina).length} en nómina
                        </span>
                        <span className="flex items-center gap-1 text-secondary">
                          <AlertTriangle className="h-3 w-3" />
                          {participants.filter((p) => !p.name_matches_nomina).length} sin coincidencia
                        </span>
                      </div>
                    )}
                  </div>
                  {participants.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Sin participantes detectados</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-xs">
                        <thead className="bg-surface-low">
                          <tr className="border-b border-border">
                            <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Nombre detectado</th>
                            <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Normalizado</th>
                            <th className="text-left py-2 px-3 font-semibold text-muted-foreground">RUT</th>
                            <th className="text-center py-2 px-3 font-semibold text-muted-foreground">Firma</th>
                            <th className="text-right py-2 px-3 font-semibold text-muted-foreground">Confianza</th>
                            <th className="text-center py-2 px-3 font-semibold text-muted-foreground">Nómina</th>
                          </tr>
                        </thead>
                        <tbody>
                          {participants.map((p) => (
                            <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-low/40 transition-colors">
                              <td className="py-2 px-3 text-muted-foreground">{p.detected_name}</td>
                              <td className="py-2 px-3 font-medium">
                                <span className="text-foreground">{p.normalized_name}</span>
                                {!p.name_matches_nomina && (
                                  <span className="ml-1 text-secondary" title="No coincide con nómina">⚠</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-muted-foreground">{p.rut || '—'}</td>
                              <td className="py-2 px-3 text-center">
                                {p.signature_detected ? (
                                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-tertiary/15 text-tertiary">
                                    <PenLine className="h-3 w-3" />
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-destructive/10 text-destructive">
                                    ✗
                                  </span>
                                )}
                              </td>
                              <td className={cn('py-2 px-3 text-right tabular-nums font-semibold', confidenceColor(p.confidence_score))}>
                                {formatConfidence(p.confidence_score)}
                              </td>
                              <td className="py-2 px-3 text-center">
                                {p.name_matches_nomina ? (
                                  <CheckCircle2 className="h-4 w-4 text-tertiary inline" />
                                ) : (
                                  <AlertTriangle className="h-4 w-4 text-secondary inline" />
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FieldCard — VIBE editable field with confidence indicator
// ---------------------------------------------------------------------------
function FieldCard({
  label,
  value,
  confidence,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  confidence: number;
  onChange: (value: string) => void;
  type?: 'text' | 'date' | 'time' | 'number';
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-lowest p-3 space-y-1.5 transition-all hover:border-primary/30">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <span className={cn('text-[10px] font-bold tabular-nums', confidenceColor(confidence))}>
          {formatConfidence(confidence)}
        </span>
      </div>
      <input
        type={type}
        className="w-full rounded-md border border-border bg-surface-low/50 px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SelectCard — VIBE editable select with confidence indicator
// ---------------------------------------------------------------------------
function SelectCard({
  label,
  value,
  confidence,
  options,
  onChange,
}: {
  label: string;
  value: string;
  confidence: number;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-lowest p-3 space-y-1.5 transition-all hover:border-primary/30">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <span className={cn('text-[10px] font-bold tabular-nums', confidenceColor(confidence))}>
          {formatConfidence(confidence)}
        </span>
      </div>
      <select
        className="w-full rounded-md border border-border bg-surface-low/50 px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
