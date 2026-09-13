'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  FileText,
  Users,
  AlertTriangle,
  Loader2,
  Download,
  CheckCircle2,
  Zap,
  X,
  ChevronRight,
  ChevronLeft,
  Brain,
  ShieldCheck,
  PenLine,
  Sparkles,
} from 'lucide-react';
import { supabase, TABLES, STORAGE_BUCKETS } from '@/lib/supabase';
import { formatDate, formatBytes } from '@/lib/utils';
import { cn } from '@/lib/cn';
import { JobStatusBadge } from '@/components/job-status-badge';
import { PdfViewer } from '@/components/pdf-viewer';
import { TalkReviewTable } from '@/components/talk-review-table';
import { ParticipantEditor } from '@/components/participant-editor';
import { ValidationAlerts } from '@/components/validation-alerts';
import type {
  ProcessingJob,
  ProcessedDocument,
  SafetyTalk,
  TalkParticipant,
  ValidationAlert,
} from '@/types';

// ---------------------------------------------------------------------------
// Page: Review — VIBE Safety AI split-screen
//   Left  (50%): PDF viewer with toolbar (zoom, pages, bounding box legend)
//   Right (50%): AI-extracted data cards with editable fields, per-field
//                confidence, biometric signature detection
//   Footer: action buttons (Rechazar, Siguiente, Aprobar)
// ---------------------------------------------------------------------------
export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;

  const [job, setJob] = React.useState<ProcessingJob | null>(null);
  const [documents, setDocuments] = React.useState<ProcessedDocument[]>([]);
  const [talks, setTalks] = React.useState<SafetyTalk[]>([]);
  const [participantsByTalk, setParticipantsByTalk] = React.useState<Record<string, TalkParticipant[]>>({});
  const [alerts, setAlerts] = React.useState<ValidationAlert[]>([]);
  const [selectedDocUrl, setSelectedDocUrl] = React.useState<string | null>(null);
  const [selectedDocName, setSelectedDocName] = React.useState<string>('');
  const [selectedDocIndex, setSelectedDocIndex] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [generatingExcel, setGeneratingExcel] = React.useState(false);
  const [excelUrl, setExcelUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [currentTalkIndex, setCurrentTalkIndex] = React.useState(0);

  // -------------------------------------------------------------------------
  // Fetch all data
  // -------------------------------------------------------------------------
  React.useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      try {
        const { data: jobData, error: jobErr } = await supabase
          .from(TABLES.PROCESSING_JOBS)
          .select('*')
          .eq('id', jobId)
          .single();
        if (jobErr) throw jobErr;
        if (cancelled) return;
        setJob(jobData as ProcessingJob);

        const { data: docData } = await supabase
          .from(TABLES.PROCESSED_DOCUMENTS)
          .select('*')
          .eq('job_id', jobId)
          .order('created_at', { ascending: true });
        if (cancelled) return;
        const docs = (docData ?? []) as ProcessedDocument[];
        setDocuments(docs);

        const { data: talkData } = await supabase
          .from(TABLES.SAFETY_TALKS)
          .select('*')
          .eq('job_id', jobId);
        if (cancelled) return;
        const fetchedTalks = (talkData ?? []) as SafetyTalk[];
        setTalks(fetchedTalks);

        if (fetchedTalks.length > 0) {
          const talkIds = fetchedTalks.map((t) => t.id);
          const { data: partData } = await supabase
            .from(TABLES.TALK_PARTICIPANTS)
            .select('*')
            .in('talk_id', talkIds);
          if (cancelled) return;
          const parts = (partData ?? []) as TalkParticipant[];
          const grouped: Record<string, TalkParticipant[]> = {};
          for (const p of parts) {
            const tid = p.talk_id ?? '';
            if (!grouped[tid]) grouped[tid] = [];
            grouped[tid].push(p);
          }
          setParticipantsByTalk(grouped);
        }

        const { data: alertData } = await supabase
          .from(TABLES.VALIDATION_ALERTS)
          .select('*')
          .eq('job_id', jobId);
        if (cancelled) return;
        setAlerts((alertData ?? []) as ValidationAlert[]);

        if (docs.length > 0) {
          await loadDocumentUrl(docs[0], 0);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Error al cargar datos');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function loadDocumentUrl(doc: ProcessedDocument, index: number) {
      try {
        const { data } = await supabase.storage
          .from(STORAGE_BUCKETS.DOCUMENTS)
          .createSignedUrl(doc.storage_path ?? '', 3600);
        if (data?.signedUrl && !cancelled) {
          setSelectedDocUrl(data.signedUrl);
          setSelectedDocName(doc.file_name ?? '');
          setSelectedDocIndex(index);
        }
      } catch {
        // Ignore - viewer will show empty state
      }
    }

    void fetchData();
    return () => { cancelled = true; };
  }, [jobId]);

  // -------------------------------------------------------------------------
  // Handle talk update
  // -------------------------------------------------------------------------
  const handleTalkUpdate = React.useCallback(async (talkId: string, updates: Partial<SafetyTalk>) => {
    setTalks((prev) =>
      prev.map((t) => (t.id === talkId ? { ...t, ...updates, updated_at: new Date().toISOString() } : t)),
    );

    const { error: updateErr } = await supabase
      .from(TABLES.SAFETY_TALKS)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', talkId);
    if (updateErr) {
      console.error('Failed to update talk:', updateErr.message);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Handle participant update
  // -------------------------------------------------------------------------
  const handleParticipantUpdate = React.useCallback(async (participantId: string, updates: Partial<TalkParticipant>) => {
    setParticipantsByTalk((prev) => {
      const next: Record<string, TalkParticipant[]> = {};
      for (const [talkId, parts] of Object.entries(prev)) {
        next[talkId] = parts.map((p) =>
          p.id === participantId ? { ...p, ...updates, updated_at: new Date().toISOString() } : p,
        );
      }
      return next;
    });

    const { error: updateErr } = await supabase
      .from(TABLES.TALK_PARTICIPANTS)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', participantId);
    if (updateErr) {
      console.error('Failed to update participant:', updateErr.message);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Resolve alert
  // -------------------------------------------------------------------------
  const handleResolveAlert = React.useCallback(async (alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, resolved: true } : a)),
    );

    const { error: updateErr } = await supabase
      .from(TABLES.VALIDATION_ALERTS)
      .update({ resolved: true })
      .eq('id', alertId);
    if (updateErr) {
      console.error('Failed to resolve alert:', updateErr.message);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Generate Excel
  // -------------------------------------------------------------------------
  const handleGenerateExcel = React.useCallback(async () => {
    setGeneratingExcel(true);
    setError(null);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const response = await fetch(`${supabaseUrl}/functions/v1/generate-excel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ job_id: jobId }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error ?? `Error ${response.status}`);
      }

      const result = await response.json();
      if (result.success && result.download_url) {
        setExcelUrl(result.download_url);
      } else {
        throw new Error(result.error ?? 'Error desconocido al generar Excel');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar Excel');
    } finally {
      setGeneratingExcel(false);
    }
  }, [jobId]);

  // -------------------------------------------------------------------------
  // Confirm and mark job as completed
  // -------------------------------------------------------------------------
  const handleConfirm = React.useCallback(async () => {
    const { error: updateErr } = await supabase
      .from(TABLES.PROCESSING_JOBS)
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', jobId);
    if (updateErr) {
      setError('Error al confirmar: ' + updateErr.message);
      return;
    }
    router.push(`/dashboard/jobs/${jobId}`);
  }, [jobId, router]);

  // -------------------------------------------------------------------------
  // Reject — mark back to review / failed
  // -------------------------------------------------------------------------
  const handleReject = React.useCallback(async () => {
    const { error: updateErr } = await supabase
      .from(TABLES.PROCESSING_JOBS)
      .update({ status: 'review', updated_at: new Date().toISOString() })
      .eq('id', jobId);
    if (updateErr) {
      setError('Error al rechazar: ' + updateErr.message);
      return;
    }
    router.push(`/dashboard/jobs/${jobId}`);
  }, [jobId, router]);

  // -------------------------------------------------------------------------
  // Navigate to next document
  // -------------------------------------------------------------------------
  const goToDoc = React.useCallback(async (index: number) => {
    if (index < 0 || index >= documents.length) return;
    const doc = documents[index];
    try {
      const { data } = await supabase.storage
        .from(STORAGE_BUCKETS.DOCUMENTS)
        .createSignedUrl(doc.storage_path ?? '', 3600);
      if (data?.signedUrl) {
        setSelectedDocUrl(data.signedUrl);
        setSelectedDocName(doc.file_name ?? '');
        setSelectedDocIndex(index);
      }
    } catch {
      // ignore
    }
  }, [documents]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="rounded-xl border border-destructive/20 bg-destructive/8 p-4 text-destructive">
          <p className="text-sm">{error}</p>
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="mt-4 text-sm text-primary hover:underline flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
      </div>
    );
  }

  const unresolvedAlerts = alerts.filter((a) => !a.resolved);
  const hasErrors = unresolvedAlerts.some((a) => a.severity === 'error');
  const currentTalk = talks[currentTalkIndex] ?? null;

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* ---------------------------------------------------------------- */}
      {/* Header bar — VIBE style                                           */}
      {/* ---------------------------------------------------------------- */}
      <div className="border-b border-border bg-surface-lowest px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/dashboard/jobs/${jobId}`)}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </button>
          <div className="h-4 w-px bg-border" />
          <span className="text-sm font-semibold text-foreground">Revisión del Job</span>
          {job && <JobStatusBadge status={job.status} />}
        </div>

        {/* Top-right: Excel + Confirm */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerateExcel}
            disabled={generatingExcel || talks.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-lowest px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-low transition-all disabled:opacity-50"
          >
            {generatingExcel ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            Generar Excel
          </button>

          {excelUrl && (
            <a
              href={excelUrl}
              download
              className="inline-flex items-center gap-1.5 rounded-lg border border-tertiary/30 bg-tertiary/10 px-3 py-1.5 text-sm font-medium text-tertiary hover:bg-tertiary/15 transition-all"
            >
              <Download className="h-4 w-4" />
              Descargar
            </a>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="border-b border-destructive/20 bg-destructive/8 px-4 py-2">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Split layout: PDF viewer (left) + Review panel (right)           */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-1 overflow-hidden">
        {/* === LEFT: PDF Viewer (50%) === */}
        <div className="w-1/2 vibe-split-panel-left flex flex-col overflow-hidden">
          {/* PDF viewer fills the panel */}
          <div className="flex-1 overflow-hidden">
            {selectedDocUrl ? (
              <PdfViewer fileUrl={selectedDocUrl} fileName={selectedDocName} className="h-full" />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-3">
                  <FileText className="h-14 w-14 mx-auto text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Selecciona un documento para visualizar</p>
                </div>
              </div>
            )}
          </div>

          {/* Document selector — VIBE toolbar with bounding box legend */}
          {documents.length > 0 && (
            <div className="border-t border-border bg-surface-low p-3 space-y-2">
              {/* Bounding box legend */}
              <div className="vibe-bbox-legend">
                <span className="flex items-center gap-1.5">
                  <span className="vibe-bbox-dot bg-primary" />
                  Curso/Título
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="vibe-bbox-dot bg-tertiary" />
                  Participantes
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="vibe-bbox-dot bg-secondary" />
                  Firmas
                </span>
              </div>

              {/* Document tabs with nav arrows */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToDoc(selectedDocIndex - 1)}
                  disabled={selectedDocIndex === 0}
                  className="flex-shrink-0 rounded-md p-1 text-muted-foreground hover:bg-surface hover:text-foreground disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex-1 flex gap-1 overflow-x-auto">
                  {documents.map((doc, i) => (
                    <DocumentTab
                      key={doc.id}
                      doc={doc}
                      isSelected={i === selectedDocIndex}
                      onClick={() => goToDoc(i)}
                    />
                  ))}
                </div>
                <button
                  onClick={() => goToDoc(selectedDocIndex + 1)}
                  disabled={selectedDocIndex >= documents.length - 1}
                  className="flex-shrink-0 rounded-md p-1 text-muted-foreground hover:bg-surface hover:text-foreground disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* === RIGHT: Review panel (50%) === */}
        <div className="w-1/2 vibe-split-panel-right overflow-auto">
          <div className="p-5 space-y-5">
            {/* AI extraction header */}
            <div className="flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/8 px-4 py-3">
              <Brain className="h-5 w-5 text-primary flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Datos extraídos por IA</p>
                <p className="text-xs text-muted-foreground">Revisa y corrige los campos detectados</p>
              </div>
              <Sparkles className="h-4 w-4 text-primary/60" />
            </div>

            {/* Validation alerts */}
            {alerts.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-foreground">
                  <ShieldCheck className="h-4 w-4 text-secondary" />
                  Alertas de validación ({unresolvedAlerts.length})
                </h3>
                <ValidationAlerts
                  alerts={alerts}
                  onResolve={handleResolveAlert}
                />
              </section>
            )}

            {/* Talk review table — VIBE cards */}
            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-foreground">
                <FileText className="h-4 w-4 text-primary" />
                Charlas detectadas ({talks.length})
              </h3>
              <TalkReviewTable
                talks={talks}
                participantsByTalk={participantsByTalk}
                alertsByTalk={alerts.reduce((acc, a) => {
                  if (a.talk_id) {
                    if (!acc[a.talk_id]) acc[a.talk_id] = [];
                    acc[a.talk_id].push(a);
                  }
                  return acc;
                }, {} as Record<string, ValidationAlert[]>)}
                onTalkUpdate={handleTalkUpdate}
              />
            </section>

            {/* Participant editor */}
            {talks.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-foreground">
                  <PenLine className="h-4 w-4 text-primary" />
                  Detección biométrica de firmas
                </h3>
                {talks.map((talk) => (
                  <div key={talk.id} className="mb-4">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">
                      {talk.course_name} · {formatDate(talk.talk_date)}
                    </p>
                    <ParticipantEditor
                      talkId={talk.id}
                      participants={participantsByTalk[talk.id] ?? []}
                      onUpdate={handleParticipantUpdate}
                    />
                  </div>
                ))}
              </section>
            )}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Action footer — VIBE style (Rechazar, Siguiente, Aprobar)       */}
      {/* ---------------------------------------------------------------- */}
      <div className="vibe-action-footer">
        {/* Reject — left */}
        <button
          onClick={handleReject}
          className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/15 transition-all"
        >
          <X className="h-4 w-4" />
          Rechazar
        </button>

        {/* Center: progress indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">{currentTalkIndex + 1}</span>
          <span>/</span>
          <span className="tabular-nums">{talks.length}</span>
          <span className="ml-1">charlas</span>
        </div>

        {/* Right: Excel + Approve */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleConfirm}
            disabled={hasErrors}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-primary-foreground transition-all vibe-hero-gradient vibe-hero-gradient-hover shadow-vibe disabled:opacity-50 disabled:cursor-not-allowed"
            title={hasErrors ? 'Resuelve los errores antes de confirmar' : 'Confirmar y finalizar'}
          >
            <CheckCircle2 className="h-4 w-4" />
            Aprobar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Document tab — VIBE style
// ---------------------------------------------------------------------------
function DocumentTab({
  doc,
  isSelected,
  onClick,
}: {
  doc: ProcessedDocument;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
        isSelected
          ? 'bg-primary text-primary-foreground shadow-vibe'
          : 'bg-surface-lowest border border-border text-muted-foreground hover:bg-surface hover:text-foreground',
      )}
      title={doc.file_name}
    >
      <FileText className="h-3 w-3" />
      <span className="truncate max-w-[120px]">{doc.file_name}</span>
      {doc.is_scanned && <span className="text-[10px] opacity-70">📷</span>}
    </button>
  );
}
