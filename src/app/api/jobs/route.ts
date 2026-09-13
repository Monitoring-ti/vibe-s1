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

    const body = await request.json();
    const { fileNames } = body; // array of file names

    // Create a processing job
    const { data: job, error: jobError } = await supabase
      .from("processing_jobs")
      .insert({
        user_id: user.id,
        estado: "pendiente",
        total_documentos: fileNames?.length || 0,
        documentos_procesados: 0,
      })
      .select()
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Error al crear el trabajo", details: jobError },
        { status: 500 },
      );
    }

    // Create document records for each file
    if (fileNames && fileNames.length > 0) {
      const documents = fileNames.map((fileName: string) => ({
        job_id: job.id,
        user_id: user.id,
        nombre_archivo: fileName,
        tamano_bytes: 0, // will be updated on upload
        mime_type: "application/pdf",
        storage_path: `documents/${job.id}/${fileName}`,
        estado: "pendiente",
      }));

      const { error: docsError } = await supabase
        .from("uploaded_documents")
        .insert(documents);

      if (docsError) {
        console.error("Error creating documents:", docsError);
      }
    }

    return NextResponse.json({ job });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = supabase
      .from("processing_jobs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("estado", status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ jobs: data });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}