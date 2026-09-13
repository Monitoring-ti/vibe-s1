"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { JobStatusBadge } from "@/components/job-status-badge";
import { AnalyzeUploader } from "@/components/analyze-uploader";
import { formatDate, formatBytes } from "@/lib/utils";
import type { Job } from "@/types";

async function getJobs(): Promise<Job[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("processing_jobs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data as Job[];
}

function KPICard({
  icon,
  label,
  value,
  suffix,
  trend,
  trendPositive = true,
}: {
  icon: string;
  label: string;
  value: string | number;
  suffix?: string;
  trend?: string;
  trendPositive?: boolean;
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 transition-shadow hover:shadow-lg hover:shadow-black/5">
      <div className="flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-container-high">
          <span className="ms text-xl text-primary">{icon}</span>
        </div>
        {trend && (
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-label-sm ${
              trendPositive
                ? "bg-secondary-container text-on-secondary-container"
                : "bg-error-container text-on-error-container"
            }`}
          >
            <span className="ms text-sm">
              {trendPositive ? "trending_up" : "trending_down"}
            </span>
            {trend}
          </span>
        )}
      </div>
      <div className="mt-4">
        <div className="flex items-baseline gap-1">
          <span className="font-headline-md text-on-surface">{value}</span>
          {suffix && (
            <span className="font-label-lg text-on-surface-variant">{suffix}</span>
          )}
        </div>
        <p className="mt-1 font-label-md text-on-surface-variant">{label}</p>
      </div>
    </div>
  );
}

function QueueItem({
  fileName,
  status,
  progress,
  step,
}: {
  fileName: string;
  status: string;
  progress: number;
  step: string;
}) {
  const isProcessing = [
    "uploading",
    "extracting",
    "ocr",
    "hermes",
    "validating",
    "generating",
  ].includes(status);

  return (
    <div className="flex items-center gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-container-high">
        <span className="ms text-xl text-primary">
          {isProcessing
            ? "hourglass_top"
            : status === "completed"
            ? "task_alt"
            : status === "failed"
            ? "error"
            : "pending"}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-label-lg text-on-surface">{fileName}</span>
          <span className="font-label-sm text-on-surface-variant">{progress}%</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-high">
            <div
              className={`h-full rounded-full ${
                isProcessing
                  ? "bg-vibe-gradient animate-shimmer"
                  : status === "completed"
                  ? "bg-secondary"
                  : status === "failed"
                  ? "bg-error"
                  : "bg-outline"
              } ${isProcessing ? "bg-[length:200%_100%]" : ""}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="font-label-sm text-on-surface-variant whitespace-nowrap">
            {step}
          </span>
        </div>
      </div>

      <JobStatusBadge status={status as any} className="flex-shrink-0" />
    </div>
  );
}

export default async function DashboardPage() {
  const jobs = await getJobs();

  const stats = {
    total: jobs.length,
    completed: jobs.filter((j) => j.estado === "completado").length,
    pending: jobs.filter(
      (j) =>
        j.estado === "pendiente" ||
        j.estado === "uploading" ||
        j.estado === "extracting",
    ).length,
    failed: jobs.filter((j) => j.estado === "error").length,
    participants: jobs.reduce((sum, j) => sum + (j.participants?.length ?? 0), 0),
    recognitionRate:
      jobs.length > 0
        ? Math.round((jobs.filter((j) => j.estado === "completado").length / jobs.length) * 100)
        : 0,
  };

  // In-progress queue
  const inProgress = jobs.filter((j) =>
    j.estado &&
    [
      "uploading",
      "extracting",
      "ocr",
      "hermes",
      "validating",
      "generating",
      "review",
      "procesando",
      "requiere_revision",
    ].includes(j.estado),
  );


  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-headline-lg text-on-surface">Dashboard</h1>
          <p className="mt-1 font-label-md text-on-surface-variant">
            Procesamiento de charlas de seguridad con OCR y biometría
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full bg-secondary-container px-3 py-1.5 font-label-md text-on-secondary-container">
            <span className="ms text-sm">verified</span>
            Motor IA v2.4
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          icon="description"
          label="Total Charlas"
          value={stats.total}
          trend="+12%"
          trendPositive
        />
        <KPICard
          icon="draw"
          label="Tasa Reconocimiento Firmas"
          value={stats.recognitionRate}
          suffix="%"
          trend="+3.2%"
          trendPositive
        />
        <KPICard
          icon="groups"
          label="Participantes"
          value={stats.participants}
        />
        <KPICard
          icon="schedule"
          label="Tiempo Ahorrado"
          value="4.2"
          suffix="h"
          trend="+18%"
          trendPositive
        />
      </div>

      {/* Upload + Queue */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Upload Area — 2 cols */}
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <span className="ms text-xl text-primary">upload_file</span>
            <h2 className="font-headline-sm text-on-surface">Carga de Documentos</h2>
          </div>
          <AnalyzeUploader maxSizeMB={20} maxFiles={5} />
        </div>

        {/* Processing Queue — 3 cols */}
        <div className="lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="ms text-xl text-primary">queue</span>
              <h2 className="font-headline-sm text-on-surface">Cola de Procesamiento</h2>
            </div>
            <span className="rounded-full bg-surface-container-high px-3 py-1 font-label-sm text-on-surface-variant">
              {inProgress.length} activos
            </span>
          </div>

          {inProgress.length > 0 ? (
                      <div className="space-y-3">
                        {inProgress.map((job) => {
                          const processed = job.documentos_procesados ?? 0;
                          const total = job.total_documentos ?? 1;
                          const progress =
                            processed > 0
                              ? Math.round((processed / total) * 100)
                              : job.estado === "procesando"
                              ? 30
                              : job.estado === "requiere_revision"
                              ? 80
                              : 0;
                          return (
                            <QueueItem
                              key={job.id}
                              fileName={job.fileName || job.nombre_archivo || "Documento"}
                              status={job.estado ?? "pending"}
                              progress={progress}
                              step={
                                job.estado === "extracting"
                                  ? "Extrayendo texto"
                                  : job.estado === "ocr"
                                  ? "OCR en proceso"
                                  : job.estado === "hermes"
                                  ? "Procesando IA"
                                  : job.estado === "validating"
                                  ? "Validando nómina"
                                  : job.estado === "procesando"
                                  ? "Procesando..."
                                  : job.estado === "requiere_revision"
                                  ? "Pendiente revisión"
                                  : "Subiendo archivo"
                              }
                            />
                          );
                        })}
                      </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-outline-variant bg-surface-container-lowest py-12 text-center">
              <span
                className="ms mb-2 text-3xl text-on-surface-variant"
                style={{ opacity: 0.5 }}
              >
                inbox
              </span>
              <p className="font-label-md text-on-surface-variant">
                No hay trabajos en cola
              </p>
              <p className="mt-1 font-label-sm text-on-surface-variant opacity-70">
                Sube archivos para empezar a procesar
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Batch History Table */}
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden">
        <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="ms text-xl text-primary">history</span>
            <h2 className="font-headline-sm text-on-surface">Historial de Lotes</h2>
          </div>
          <span className="font-label-md text-on-surface-variant">{jobs.length} registros</span>
        </div>

        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span
              className="ms mb-3 text-4xl text-on-surface-variant"
              style={{ opacity: 0.4 }}
            >
              folder_open
            </span>
            <p className="font-label-lg text-on-surface">Sin lotes procesados</p>
            <p className="mt-1 font-label-md text-on-surface-variant">
              Crea un nuevo trabajo para empezar
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low text-left">
                  <th className="px-5 py-3 font-label-md text-on-surface-variant">Archivo</th>
                  <th className="px-5 py-3 font-label-md text-on-surface-variant">Estado</th>
                  <th className="px-5 py-3 font-label-md text-on-surface-variant">Participantes</th>
                  <th className="px-5 py-3 font-label-md text-on-surface-variant">Tamaño</th>
                  <th className="px-5 py-3 font-label-md text-on-surface-variant">Fecha</th>
                  <th className="px-5 py-3 font-label-md text-on-surface-variant text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b border-outline-variant last:border-0 transition-colors hover:bg-surface-container-low"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="ms text-lg text-on-surface-variant">article</span>
                        <span className="font-medium text-on-surface">
                          {job.fileName || job.nombre_archivo || "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <JobStatusBadge status={job.estado ?? "pending"} />
                    </td>
                    <td className="px-5 py-3 text-on-surface-variant">
                      {job.participants?.length ?? 0}
                    </td>
                    <td className="px-5 py-3 text-on-surface-variant">
                      {job.fileSize ? formatBytes(job.fileSize) : "—"}
                    </td>
                    <td className="px-5 py-3 font-label-sm text-on-surface-variant">
                      {formatDate(job.createdAt || job.created_at)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/dashboard/jobs/${job.id}`}
                        className="inline-flex items-center gap-1 rounded-full border border-outline-variant px-3 py-1.5 font-label-md text-on-surface transition-colors hover:bg-surface-container-high"
                      >
                        <span className="ms text-sm">visibility</span>
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}