import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const EDGE_FUNCTION_URL = process.env.SUPABASE_FUNCTIONS_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const { jobId, documentIds } = body; // documentIds is array of document UUIDs

    if (!jobId || !documentIds || !documentIds.length) {
      return NextResponse.json(
        { error: "Faltan jobId o documentIds" },
        { status: 400 },
      );
    }

    // Verify job belongs to user
    const { data: job, error: jobError } = await supabase
      .from("processing_jobs")
      .select("id, user_id")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Trabajo no encontrado" }, { status: 404 });
    }

    // Verify documents belong to job
    const { data: docs, error: docsError } = await supabase
      .from("uploaded_documents")
      .select("id, storage_path")
      .eq("job_id", jobId)
      .in("id", documentIds);

    if (docsError || !docs || docs.length === 0) {
      return NextResponse.json(
        { error: "Documentos no encontrados" },
        { status: 404 },
      );
    }

    // Trigger Edge Function for each document
    const results = [];
    for (const doc of docs) {
      try {
        // Update document status
        await supabase
          .from("uploaded_documents")
          .update({ estado: "procesando", updated_at: new Date().toISOString() })
          .eq("id", doc.id);

        // Call Edge Function
        const response = await fetch(`${EDGE_FUNCTION_URL}/process-pdf`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            apikey: SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({
            job_id: jobId,
            document_id: doc.id,
          }),
        });

        const result = await response.json();
        results.push({ documentId: doc.id, success: response.ok, ...result });

        if (!response.ok) {
          console.error(`Process-pdf failed for ${doc.id}:`, result);
        }
      } catch (err) {
        console.error(`Error processing ${doc.id}:`, err);
        results.push({
          documentId: doc.id,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    // Update job document count
    const { data: updatedJob } = await supabase
      .from("processing_jobs")
      .select("documentos_procesados, total_documentos")
      .eq("id", jobId)
      .single();

    const processedCount = (updatedJob?.documentos_procesados || 0) + results.filter(r => r.success).length;

    await supabase
      .from("processing_jobs")
      .update({
        documentos_procesados: processedCount,
        estado: processedCount >= (updatedJob?.total_documentos || 0) ? "requiere_revision" : "procesando",
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Process API Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}