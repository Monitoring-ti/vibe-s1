'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  FileText,
  Users,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Eye,
  Download,
  Sparkles,
  TrendingUp,
  ScanLine,
} from 'lucide-react';
import { supabase, TABLES, STORAGE_BUCKETS } from '@/lib/supabase';
import { formatDate, formatBytes } from '@/lib/utils';
import { JobStatusBadge } from '@/components/job-status-badge';
import type {
  ProcessingJob,
  ProcessedDocument,
  SafetyTalk,
  TalkParticipant,
  ValidationAlert,
} from '@/types';

// ---------------------------------------------------------------------------
// Page: Job Detail — VIBE Safety AI design
// ---------------------------------------------------------------------------
export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;

  const [job, setJob] = React.useState<ProcessingJob | null>(null);
  const [documents, setDocuments] = React.useState<ProcessedDocument[]>([]);
  const [talks, setTalks] = React.useState<SafetyTalk[]>([]);
  const [participants, setParticipants] = React.useState<TalkParticipant[]>([]);
  const [alerts, setAlerts] = React.useState<ValidationAlert[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Fetch all data for this job
  // -------------------------------------------------------------------------
  React.useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);

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
        setDocuments((docData ?? []) as ProcessedDocument[]);

        const { data: talkData } = await supabase
          .from(TABLES.SAFETY_TALKS)
          .select('*')
          .eq('job_id', jobId);
        if (cancelled) return;
        setTalks((talkData ?? []) as SafetyTalk[]);

        if (talkData && talkData.length > 0) {
          const talkIds = (talkData as any[]).map((t) => t.id);
          const { data: partData } = await supabase
            .from(TABLES.TALK_PARTICIPANTS)
            .select('*')
            .in('talk_id', talkIds);
          if (cancelled) return;
          setParticipants((partData ?? []) as TalkParticipant[]);
        }

        const { data: alertData } = await supabase
          .from(TABLES.VALIDATION_ALERTS)
          .select('*')
          .eq('job_id', jobId);
        if (cancelled) return;
        setAlerts((alertData ?? []) as ValidationAlert[]);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Error al cargar el job');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchData();
    return () => { cancelled = true; };
  }, [jobId]);

  // -------------------------------------------------------------------------
  // Derived stats
  // -------------------------------------------------------------------------
  const stats = React.useMemo(() => {
    const totalParticipants = participants.length;
    const unresolvedAlerts = alerts.filter((a) => !a.resolved);
    const errorAlerts = unresolvedAlerts.filter((a) => a.severity === 'error').length;
    const warningAlerts = unresolvedAlerts.filter((a) => a.severity === 'warning').length;
    const talksRequiringReview = talks.filter((t) => t.requires_review).length;
    const avgConfidence = talks.length > 0
      ? Math.round((talks.reduce((sum, t) => sum + (t.confidence_score || 0), 0) / talks.length) * 100)
      : 0;

    return {
      totalTalks: talks.length,
      totalParticipants,
      totalAlerts: unresolvedAlerts.length,
      errorAlerts,
      warningAlerts,
      talksRequiringReview,
      avgConfidence,
    };
  }, [talks, participants, alerts]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="rounded-xl border border-destructive/20 bg-destructive/8 p-4 text-destructive">
          <p className="text-sm font-semibold">Error</p>
          <p className="text-sm mt-1">{error ?? 'No se encontró el job'}</p>
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="mt-4 text-sm text-primary hover:underline flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al dashboard
        </button>
      </div>
    );
  }

  const canReview = job.status === 'review' || job.status === 'completed';
  const canGenerateExcel = job.status === 'completed' && talks.length > 0;
  const progressPct = job.total_documents > 0
    ? Math.round((job.processed_documents / job.total_documents) * 100)
    : 0;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header with VIBE gradient title */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al dashboard
          </button>
          <h1 className="text-3xl font-bold">
            <span className="vibe-gradient-text">Job</span>{' '}
            <span className="text-foreground tabular-nums">{jobId.substring(0, 8)}</span>
          </h1>
          <div className="flex items-center gap-3">
            <JobStatusBadge status={job.status} />
            <span className="text-sm text-muted-foreground">
              Creado: {formatDate(job.created_at)}
            </span>
          </div>
        </div>

        {canReview && (
          <button
            onClick={() => router.push(`/dashboard/jobs/${jobId}/review`)}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all vibe-hero-gradient vibe-hero-gradient-hover shadow-vibe"
          >
            <Eye className="h-4 w-4" />
            Ir a revisión
          </button>
        )}
      </div>

      {/* Progress bar — VIBE style */}
      <div className="rounded-xl border border-border bg-surface-lowest p-4 shadow-sm space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <ScanLine className="h-4 w-4" />
            Progreso de procesamiento
          </span>
          <span className="font-semibold tabular-nums text-foreground">
            {job.processed_documents} / {job.total_documents} documentos · {progressPct}%
          </span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-surface overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 vibe-hero-gradient"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Stats grid — VIBE cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <VibeStatCard
          icon={<FileText className="h-5 w-5" />}
          label="Charlas detectadas"
          value={stats.totalTalks}
          accent="primary"
        />
        <VibeStatCard
          icon={<Users className="h-5 w-5" />}
          label="Participantes"
          value={stats.totalParticipants}
          accent="tertiary"
        />
        <VibeStatCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Alertas"
          value={stats.totalAlerts}
          subValue={`${stats.errorAlerts} errores · ${stats.warningAlerts} advertencias`}
          accent="secondary"
        />
        <VibeStatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Confianza promedio"
          value={`${stats.avgConfidence}%`}
          accent={stats.avgConfidence >= 85 ? 'tertiary' : stats.avgConfidence >= 70 ? 'secondary' : 'destructive'}
        />
      </div>

      {/* Error message */}
      {job.error_message && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/8 p-4">
          <p className="text-sm font-semibold text-destructive">Error del job</p>
          <p className="text-sm text-destructive/80 mt-1">{job.error_message}</p>
        </div>
      )}

      {/* Documents list — VIBE cards */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">
          Documentos procesados ({documents.length})
        </h2>
        {documents.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-lowest p-8 text-center shadow-sm">
            <FileText className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No hay documentos en este job.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => {
              const docTalks = talks.filter((t) => t.document_id === doc.id);
              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-4 rounded-xl border border-border bg-surface-lowest p-4 shadow-sm vibe-card-hover"
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.file_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatBytes(doc.file_size)}
                      {doc.is_scanned && ' · Escaneado'}
                      {docTalks.length > 0 && ` · ${docTalks.length} charla${docTalks.length !== 1 ? 's' : ''}`}
                    </p>
                    {doc.error_message && (
                      <p className="text-xs text-destructive mt-0.5">{doc.error_message}</p>
                    )}
                  </div>
                  {/* Document status indicator */}
                  <div className="flex-shrink-0">
                    {doc.status === 'completed' && <CheckCircle2 className="h-5 w-5 text-tertiary" />}
                    {doc.status === 'processing' && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                    {doc.status === 'failed' && <AlertTriangle className="h-5 w-5 text-destructive" />}
                    {doc.status === 'pending' && <div className="h-5 w-5 rounded-full border-2 border-muted" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VIBE Stat Card
// ---------------------------------------------------------------------------
function VibeStatCard({
  icon,
  label,
  value,
  subValue,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  subValue?: string;
  accent: 'primary' | 'tertiary' | 'secondary' | 'destructive';
}) {
  const accentClasses: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    tertiary: 'bg-tertiary/10 text-tertiary',
    secondary: 'bg-secondary/10 text-secondary',
    destructive: 'bg-destructive/10 text-destructive',
  };

  return (
    <div className="rounded-xl border border-border bg-surface-lowest p-4 shadow-sm vibe-card-hover space-y-2">
      <div className="flex items-center gap-2.5">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', accentClasses[accent])}>
          {icon}
        </div>
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
      {subValue && <p className="text-xs text-muted-foreground">{subValue}</p>}
    </div>
  );
}

// cn helper for local use
import { cn } from '@/lib/cn';
