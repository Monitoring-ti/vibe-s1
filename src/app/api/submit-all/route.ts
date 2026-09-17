/**
 * POST /api/submit-all
 * Recibe MÚLTIPLES PDFs en un solo request multipart (campo "files").
 * Por cada archivo: sube a Storage, crea job+documento, y dispara UN webhook n8n.
 * Devuelve la lista de {uploadId, jobId} en el mismo orden para que la web
 * mapee cada archivo con su job y haga polling.
 */
import { createClient as createServerClient } from "@supabase/supabase-js";
import { getUserOrDev } from "@/lib/supabase/dev";
import { NextResponse } from "next/server";

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "https://n8n.srv1748637.hstgr.cloud/webhook-test/c3b54348-be7f-4b4a-a419-60ccadd7f441";
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || "";

const MAX_FILES = 10;
const MAX_SIZE = 20 * 1024 * 1024;

interface JobResult {
  uploadId: string;
  jobId: string | null;
  fileName: string;
  error?: string;
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getUserOrDev();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) {
      return NextResponse.json({ error: "Faltan archivos" }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Máximo ${MAX_FILES} archivos` }, { status: 400 });
    }

    const bucket = process.env.STORAGE_BUCKET_NAME || "charlas-pdfs";
    const results: JobResult[] = [];

    for (const file of files) {
      const uploadId = crypto.randomUUID();

      if (file.type !== "application/pdf") {
        results.push({ uploadId, jobId: null, fileName: file.name, error: "No es PDF" });
        continue;
      }
      if (file.size > MAX_SIZE) {
        results.push({ uploadId, jobId: null, fileName: file.name, error: "Excede 20 MB" });
        continue;
      }

      // 1. Job
      const { data: job, error: jobError } = await supabase
        .from("processing_jobs")
        .insert({
          user_id: user.id,
          estado: "procesando",
          total_documentos: 1,
          documentos_procesados: 0,
        })
        .select()
        .single();

      if (jobError || !job) {
        results.push({ uploadId, jobId: null, fileName: file.name, error: "Error creando job" });
        continue;
      }

      // 2. Storage
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const storagePath = `${user.id}/${job.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, file, { contentType: "application/pdf", upsert: false });

      if (uploadError) {
        await supabase.from("processing_jobs").update({ estado: "error", error_mensaje: uploadError.message }).eq("id", job.id);
        results.push({ uploadId, jobId: null, fileName: file.name, error: "Error subiendo" });
        continue;
      }

      // 3. URL firmada
      const { data: signed } = await supabase.storage
        .from(bucket)
        .createSignedUrl(storagePath, 3600);

      // 4. Documento
      const { data: doc, error: docError } = await supabase
        .from("uploaded_documents")
        .insert({
          job_id: job.id,
          user_id: user.id,
          nombre_archivo: file.name,
          tamano_bytes: file.size,
          mime_type: file.type || "application/pdf",
          storage_path: storagePath,
          estado: "procesando",
        })
        .select()
        .single();

      if (docError || !doc) {
        await supabase.from("processing_jobs").update({ estado: "error", error_mensaje: "Error registrando documento" }).eq("id", job.id);
        results.push({ uploadId, jobId: null, fileName: file.name, error: "Error registrando" });
        continue;
      }

      // 5. Webhook n8n con el ARCHIVO binario + metadata
      const forwardForm = new FormData();
      forwardForm.append("file", file, file.name);
      forwardForm.append("job_id", job.id);
      forwardForm.append("document_id", doc.id);
      forwardForm.append("file_name", file.name);
      forwardForm.append("mime_type", file.type || "application/pdf");
      forwardForm.append("file_size", String(file.size));
      forwardForm.append("storage_path", storagePath);
      forwardForm.append("bucket", bucket);
      if (signed) forwardForm.append("pdf_url", signed.signedUrl);

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const whRes = await fetch(N8N_WEBHOOK_URL, {
          method: "POST",
          headers: N8N_WEBHOOK_SECRET ? { "X-Webhook-Secret": N8N_WEBHOOK_SECRET } : {},
          body: forwardForm,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!whRes.ok) {
          const errText = await whRes.text();
          console.error("[submit-all] n8n", whRes.status, errText.slice(0, 200));
          await supabase.from("processing_jobs").update({ estado: "error", error_mensaje: `n8n: ${whRes.status}` }).eq("id", job.id);
          results.push({ uploadId, jobId: null, fileName: file.name, error: `n8n ${whRes.status}` });
          continue;
        }
      } catch (whErr) {
        console.error("[submit-all] webhook inalcanzable:", whErr);
        await supabase.from("processing_jobs").update({ estado: "error", error_mensaje: "n8n inalcanzable" }).eq("id", job.id);
        results.push({ uploadId, jobId: null, fileName: file.name, error: "n8n inalcanzable" });
        continue;
      }

      results.push({ uploadId, jobId: job.id, fileName: file.name });
    }

    const okCount = results.filter((r) => r.jobId).length;
    if (okCount === 0) {
      const firstError = results.find((r) => r.error)?.error || "Error desconocido";
      return NextResponse.json(
        { error: `Ningún archivo pudo enviarse: ${firstError}`, jobs: results },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, sent: okCount, jobs: results });
  } catch (error) {
    console.error("[submit-all] Error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}