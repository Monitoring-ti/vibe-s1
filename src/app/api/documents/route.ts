import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const formData = await request.formData();
    const jobId = formData.get("jobId") as string;
    const files = formData.getAll("files") as File[];

    if (!jobId || !files.length) {
      return NextResponse.json(
        { error: "Faltan jobId o archivos" },
        { status: 400 },
      );
    }

    // Verify job belongs to user
    const { data: job, error: jobError } = await supabase
      .from("processing_jobs")
      .select("id, user_id, total_documentos")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Trabajo no encontrado" }, { status: 404 });
    }

    const bucketName = process.env.NEXT_PUBLIC_STORAGE_BUCKET || "charlas-pdfs";
    const uploadedDocs = [];

    // Upload each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = `${Date.now()}-${i}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const storagePath = `documents/${jobId}/${fileName}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: "application/pdf",
        });

      if (uploadError) {
        console.error(`Upload error for ${file.name}:`, uploadError);
        continue;
      }

      // Get or create document record
      const { data: doc, error: docError } = await supabase
        .from("uploaded_documents")
        .upsert({
          job_id: jobId,
          user_id: user.id,
          nombre_archivo: file.name,
          tamano_bytes: file.size,
          mime_type: file.type || "application/pdf",
          storage_path: storagePath,
          estado: "uploaded",
        }, {
          onConflict: "storage_path",
          ignoreDuplicates: false,
        })
        .select()
        .single();

      if (docError) {
        console.error(`Document record error for ${file.name}:`, docError);
        continue;
      }

      uploadedDocs.push({
        id: doc.id,
        fileName: file.name,
        storagePath,
        size: file.size,
      });
    }

    // Update job status to processing and increment document count
    await supabase
      .from("processing_jobs")
      .update({
        estado: "procesando",
        total_documentos: job.total_documentos + uploadedDocs.length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return NextResponse.json({ documents: uploadedDocs });
  } catch (error) {
    console.error("Upload API Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}