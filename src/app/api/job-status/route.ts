/**
 * GET /api/job-status?id=<jobId>
 * Polling del estado del job para la web durante el proceso en n8n.
 * Devuelve estado del job, documento y conteo de charlas detectadas.
 */
import { createClient } from "@/lib/supabase/server";
import { getUserOrDev } from "@/lib/supabase/dev";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await getUserOrDev();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("id");

    if (!jobId) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }

    const { data: job, error } = await supabase
      .from("processing_jobs")
      .select("id, estado, total_documentos, documentos_procesados, error_mensaje, created_at, updated_at")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job no encontrado" }, { status: 404 });
    }

    // Contar charlas asociadas al job (puede estar vacío mientras procesa)
    const { count: talksCount } = await supabase
      .from("safety_talks")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job.id);

    const { count: docsCount } = await supabase
      .from("uploaded_documents")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job.id);

    return NextResponse.json({
      ok: true,
      job: {
        id: job.id,
        estado: job.estado,
        error_mensaje: job.error_mensaje,
        updated_at: job.updated_at,
      },
      talks: talksCount ?? 0,
      docs: docsCount ?? 0,
    });
  } catch (error) {
    console.error("[job-status] Error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}