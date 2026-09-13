"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface SessionParticipant {
  nombre_detectado: string;
  firma_detectada: boolean;
  confianza_nombre: number;
  nomina_match: boolean;
  nomina_matched_name: string | null;
  requiere_revision: boolean;
}

interface SessionTalk {
  id: string;
  nombre_curso: string;
  fecha_inicio: string | null;
  hora_inicio: string | null;
  duracion_minutos: number;
  confianza_general: number;
  requiere_revision: boolean;
  participantes: SessionParticipant[];
}

interface SessionStats {
  totalCharlas: number;
  totalParticipantes: number;
  firmasDetectadas: number;
  firmasSobreTotal: number;
  matchesNomina: number;
  participacionesUnicas: number;
  trabajadoresActivos: number;
  minutosTotales: number;
  confianzaPromedio: number;
  requierenRevision: number;
}

interface WorkerRow {
  nombre: string;
  charlas: number;
  firmas: number;
  minutos: number;
  ultimaCharla: string | null;
}

export function SessionResults() {
  const [charlas, setCharlas] = useState<SessionTalk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSession() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("No autenticado");
        setLoading(false);
        return;
      }

      // Charlas de la sesión: hoy + usuario
      const today = new Date().toISOString().slice(0, 10);
      const { data: talks, error: talksError } = await supabase
        .from("safety_talks")
        .select(
          "id, nombre_curso, fecha_inicio, hora_inicio, duracion_minutos, confianza_general, requiere_revision",
        )
        .eq("user_id", user.id)
        .gte("created_at", `${today}T00:00:00`)
        .order("created_at", { ascending: false });

      if (talksError) {
        setError(talksError.message);
        setLoading(false);
        return;
      }

      // Participantes por charla
      const enriched: SessionTalk[] = [];
      for (const t of talks ?? []) {
        const { data: parts } = await supabase
          .from("talk_participants")
          .select(
            "id, nombre_detectado, firma_detectada, confianza_nombre, requiere_revision",
          )
          .eq("talk_id", t.id);

        enriched.push({
          ...t,
          participantes: (parts ?? []).map((p) => ({
            nombre_detectado: p.nombre_detectado,
            firma_detectada: p.firma_detectada,
            confianza_nombre: p.confianza_nombre,
            nomina_match: false,
            nomina_matched_name: null,
            requiere_revision: p.requiere_revision,
          })),
        });
      }

      setCharlas(enriched);
      setLoading(false);
    }

    loadSession();
  }, []);

  // ── Estadísticas acumuladas ──
  const stats: SessionStats = (() => {
    const allParticipants = charlas.flatMap((c) => c.participantes);
    const firmas = allParticipants.filter((p) => p.firma_detectada).length;
    const totalMinutos = charlas.reduce(
      (s, c) => s + (c.duracion_minutos ?? 0) * c.participantes.length,
      0,
    );
    const confMedia =
      charlas.length > 0
        ? charlas.reduce((s, c) => s + (c.confianza_general ?? 0), 0) / charlas.length
        : 0;
    const trabajadoresUnicos = new Set(
      allParticipants.map((p) => p.nombre_detectado.trim().toUpperCase()),
    );

    return {
      totalCharlas: charlas.length,
      totalParticipantes: allParticipants.length,
      firmasDetectadas: firmas,
      firmasSobreTotal:
        allParticipants.length > 0
          ? Math.round((firmas / allParticipants.length) * 100)
          : 0,
      matchesNomina: 0,
      participacionesUnicas: trabajadoresUnicos.size,
      trabajadoresActivos: trabajadoresUnicos.size,
      minutosTotales: totalMinutos,
      confianzaPromedio: Math.round(confMedia * 100),
      requierenRevision: charlas.filter((c) => c.requiere_revision).length,
    };
  })();

  // ── Acumulado por trabajador ──
  const porTrabajador: WorkerRow[] = (() => {
    const map = new Map<string, WorkerRow>();
    for (const talk of charlas) {
      for (const p of talk.participantes) {
        const key = p.nombre_detectado.trim().toUpperCase();
        if (!map.has(key)) {
          map.set(key, {
            nombre: p.nombre_detectado,
            charlas: 0,
            firmas: 0,
            minutos: 0,
            ultimaCharla: talk.fecha_inicio,
          });
        }
        const row = map.get(key)!;
        row.charlas += 1;
        if (p.firma_detectada) row.firmas += 1;
        row.minutos += talk.duracion_minutos ?? 0;
        if (talk.fecha_inicio && (!row.ultimaCharla || talk.fecha_inicio > row.ultimaCharla)) {
          row.ultimaCharla = talk.fecha_inicio;
        }
      }
    }
    return [...map.values()].sort((a, b) => b.charlas - a.charlas);
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="ms animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }

  if (error) {
    return <div className="rounded-xl bg-error-container p-4 text-on-error-container">{error}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-headline-lg text-on-surface">Resultados de la Sesión</h1>
        <p className="mt-1 font-label-md text-on-surface-variant">
          Charlas procesadas hoy · estadísticas acumuladas
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPI icon="co_present" label="Charlas hoy" value={stats.totalCharlas} />
        <KPI
          icon="draw"
          label="Firmas detectadas"
          value={`${stats.firmasDetectadas}/${stats.totalParticipantes}`}
          suffix={` (${stats.firmasSobreTotal}%)`}
        />
        <KPI icon="groups" label="Trabajadores activos" value={stats.trabajadoresActivos} />
        <KPI
          icon="schedule"
          label="Minutos capacitación"
          value={stats.minutosTotales}
          suffix={` (${Math.round(stats.minutosTotales / 60)} h)`}
        />
      </div>

      {/* Alerta revisión */}
      {stats.requierenRevision > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-secondary/30 bg-secondary/10 px-4 py-3">
          <span className="ms text-xl text-secondary">warning</span>
          <span className="font-label-lg text-on-surface">
            {stats.requierenRevision} charla{stats.requierenRevision !== 1 ? "s" : ""}{" "}
            requieren revisión manual
          </span>
        </div>
      )}

      {/* Tabla acumulada por trabajador */}
      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
        <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="ms text-xl text-primary">leaderboard</span>
            <h2 className="font-headline-sm text-on-surface">Acumulado por Trabajador</h2>
          </div>
          <span className="font-label-md text-on-surface-variant">
            {porTrabajador.length} trabajador{porTrabajador.length !== 1 ? "es" : ""}
          </span>
        </div>

        {porTrabajador.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <span className="ms mb-2 text-4xl text-on-surface-variant opacity-40">group_off</span>
            <p className="font-label-lg text-on-surface">Sin datos aún</p>
            <p className="mt-1 font-label-md text-on-surface-variant">
              Procesa una charla para ver estadísticas
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low text-left">
                  <th className="px-5 py-3 font-label-md text-on-surface-variant">Trabajador</th>
                  <th className="px-5 py-3 font-label-md text-on-surface-variant">Charlas</th>
                  <th className="px-5 py-3 font-label-md text-on-surface-variant">Firmas</th>
                  <th className="px-5 py-3 font-label-md text-on-surface-variant">Minutos</th>
                  <th className="px-5 py-3 font-label-md text-on-surface-variant">Última</th>
                </tr>
              </thead>
              <tbody>
                {porTrabajador.map((row) => (
                  <tr
                    key={row.nombre}
                    className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low"
                  >
                    <td className="px-5 py-3 font-medium text-on-surface">{row.nombre}</td>
                    <td className="px-5 py-3 text-on-surface-variant">{row.charlas}</td>
                    <td className="px-5 py-3">
                      <span className={row.firmas === row.charlas ? "text-tertiary" : "text-secondary"}>
                        {row.firmas}/{row.charlas}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-on-surface-variant">{row.minutos}</td>
                    <td className="px-5 py-3 font-label-sm text-on-surface-variant">
                      {row.ultimaCharla ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Charlas del día */}
      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
        <div className="flex items-center gap-2 border-b border-outline-variant px-5 py-4">
          <span className="ms text-xl text-primary">history</span>
          <h2 className="font-headline-sm text-on-surface">Charlas de Hoy</h2>
        </div>
        {charlas.length === 0 ? (
          <p className="px-5 py-8 text-center font-label-md text-on-surface-variant">
            No hay charlas procesadas hoy
          </p>
        ) : (
          <div className="divide-y divide-outline-variant">
            {charlas.map((talk) => (
              <div key={talk.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="font-medium text-on-surface">{talk.nombre_curso}</p>
                  <p className="font-label-sm text-on-surface-variant">
                    {talk.fecha_inicio ?? "sin fecha"} · {talk.hora_inicio ?? "—"} ·{" "}
                    {talk.duracion_minutos} min · {talk.participantes.length} participantes
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <ConfidenceChip value={talk.confianza_general} />
                  <Link
                    href={`/dashboard/jobs/${talk.id}/review`}
                    className="rounded-full border border-outline-variant px-3 py-1.5 font-label-md text-on-surface hover:bg-surface-container-high"
                  >
                    Revisar
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KPI({
  icon,
  label,
  value,
  suffix,
}: {
  icon: string;
  label: string;
  value: string | number;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-container-high">
        <span className="ms text-xl text-primary">{icon}</span>
      </div>
      <div className="mt-4">
        <span className="font-headline-md text-on-surface">{value}</span>
        {suffix && <span className="font-label-md text-on-surface-variant">{suffix}</span>}
      </div>
      <p className="mt-1 font-label-md text-on-surface-variant">{label}</p>
    </div>
  );
}

function ConfidenceChip({ value }: { value: number }) {
  const pct = Math.round((value ?? 0) * 100);
  const color =
    pct >= 80 ? "bg-tertiary/15 text-tertiary" : pct >= 60 ? "bg-secondary/15 text-secondary" : "bg-destructive/10 text-destructive";
  return (
    <span className={`rounded-full px-2.5 py-0.5 font-label-sm ${color}`}>{pct}%</span>
  );
}