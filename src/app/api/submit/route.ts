/**
 * POST /api/submit
 * Flujo n8n: sube PDF a Storage, crea job+documento, dispara webhook n8n
 * y devuelve jobId para que la web haga polling.
 */
import { createClient } from "@/lib/supabase/server";
import { getUserOrDev } from "@/lib/supabase/dev";
import { NextResponse } from "next/server";

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "https://n8n.srv1748637.hstgr.cloud/webhook-test/c3b54348-be7f-4b4a-a419-60ccadd7f441";
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || "";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getUserOrDev();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!N8N_WEBHOOK_URL) {
      return NextResponse.json(
        { error: "N8N_WEBHOOK_URL no configurada" },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Solo se aceptan PDF" }, { status: 400 });
    }

    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: "El archivo excede 20 MB" }, { status: 400 });
    }

    // 1. Crear job
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
      console.error("[submit] Error creando job:", jobError);
      return NextResponse.json({ error: "Error al crear el trabajo" }, { status: 500 });
    }

    // 2. Subir PDF a Storage (ruta con user_id para RLS)
    const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const storagePath = `${user.id}/${job.id}/${fileName}`;
    const bucket = process.env.STORAGE_BUCKET_NAME || "charlas-pdfs";

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, file, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("[submit] Error subiendo a Storage:", uploadError);
      await supabase.from("processing_jobs").update({ estado: "error", error_mensaje: uploadError.message }).eq("id", job.id);
      return NextResponse.json({ error: "Error al guardar el archivo" }, { status: 500 });
    }

    // 3. Crear URL firmada (válida 1 hora) para que n8n descargue el PDF
    const { data: signed, error: signError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(storagePath, 3600);

    if (signError || !signed) {
      console.error("[submit] Error generando URL firmada:", signError);
      return NextResponse.json({ error: "Error generando URL de descarga" }, { status: 500 });
    }

    // 4. Registrar documento
    const { data: doc, error: docError } = await supabase
      .from("uploaded_documents")
      .insert({
        job_id: job.id,
        user_id: user.id,
        nombre_archivo: file.name,
        tamano_bytes: file.size,
        mime_type: "application/pdf",
        storage_path: storagePath,
        estado: "procesando",
      })
      .select()
      .single();

    if (docError || !doc) {
      console.error("[submit] Error creando documento:", docError);
      return NextResponse.json({ error: "Error al registrar documento" }, { status: 500 });
    }

    // 5. Disparar webhook n8n — envía el ARCHIVO como multipart/form-data
    //    (n8n lo recibe como binario en el nodo Webhook, con mimetype)
    const forwardForm = new FormData();
    forwardForm.append("file", file, file.name);
    forwardForm.append("job_id", job.id);
    forwardForm.append("document_id", doc.id);
    forwardForm.append("file_name", file.name);
    forwardForm.append("mime_type", file.type || "application/pdf");
    forwardForm.append("file_size", String(file.size));
    forwardForm.append("storage_path", storagePath);
    forwardForm.append("bucket", bucket);
    forwardForm.append("pdf_url", signed.signedUrl);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const webhookRes = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: {
          // Content-Type multipart lo establece FormData automáticamente
          ...(N8N_WEBHOOK_SECRET
            ? { "X-Webhook-Secret": N8N_WEBHOOK_SECRET }
            : {}),
        },
        body: forwardForm,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!webhookRes.ok) {
        const errText = await webhookRes.text();
        console.error("[submit] Webhook n8n respondió error:", webhookRes.status, errText.slice(0, 300));
        await supabase.from("processing_jobs").update({
          estado: "error",
          error_mensaje: `Webhook n8n: ${webhookRes.status}`,
        }).eq("id", job.id);
        return NextResponse.json(
          { error: `n8n respondió ${webhookRes.status}. Revisa que el workflow esté activo en /webhook/ (no /webhook-test/)` },
          { status: 502 },
        );
      }
    } catch (whErr) {
      console.error("[submit] Webhook n8n no alcanzable:", whErr);
      await supabase.from("processing_jobs").update({
        estado: "error",
        error_mensaje: "No se pudo contactar el webhook n8n",
      }).eq("id", job.id);
      return NextResponse.json(
        { error: "No se pudo contactar n8n. Verifica la URL del webhook (producción: /webhook/, workflow activo)" },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, jobId: job.id, documentId: doc.id });
  } catch (error) {
    console.error("[submit] Error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}