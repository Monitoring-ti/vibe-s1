/**
 * POST /api/analyze
 * Recibe: { fileName, pages: [{pageNumber, base64}] }
 * Llama al modelo de visión, valida contra nómina, guarda charla+participantes en BD.
 * Devuelve el resultado para las estadísticas de sesión.
 */
import { createClient } from "@/lib/supabase/server";
import { extractWithVision } from "@/lib/vision/client";
import { matchNomina } from "@/lib/validation/nomina";
import { NextResponse } from "next/server";

interface AnalyzePage {
  pageNumber: number;
  base64: string;
}

// Límite de payload razonable (10 páginas × ~1.5MB base64)
const MAX_PAGES = 10;
const MAX_TOTAL_BASE64 = 20 * 1024 * 1024; // 20MB

function parseFecha(fecha: string | null): string | null {
  if (!fecha) return null;
  // DD/MM/AAAA -> AAAA-MM-DD
  const m = fecha.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  // Ya viene en ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha.trim())) return fecha.trim();
  return null;
}

function parseHora(hora: string | null): string | null {
  if (!hora) return null;
  const m = hora.trim().match(/^(\d{1,2}):(\d{2})/);
  if (m) {
    return `${m[1].padStart(2, "0")}:${m[2]}`;
  }
  return null;
}

function calcularFin(horaInicio: string | null, duracion: number): string | null {
  if (!horaInicio) return null;
  const [h, min] = horaInicio.split(":").map(Number);
  const total = h * 60 + min + duracion;
  const hh = Math.floor((total % 1440) / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

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
    const { fileName, pages } = body as { fileName: string; pages: AnalyzePage[] };

    if (!fileName || !pages || !Array.isArray(pages) || pages.length === 0) {
      return NextResponse.json(
        { error: "Faltan fileName o pages" },
        { status: 400 },
      );
    }

    if (pages.length > MAX_PAGES) {
      return NextResponse.json(
        { error: `Máximo ${MAX_PAGES} páginas por documento` },
        { status: 400 },
      );
    }

    const totalSize = pages.reduce((s, p) => s + (p.base64?.length ?? 0), 0);
    if (totalSize > MAX_TOTAL_BASE64) {
      return NextResponse.json(
        { error: "Documento demasiado grande" },
        { status: 400 },
      );
    }

    // 1. Llamar al modelo de visión
    const visionResult = await extractWithVision(pages, fileName);

    if (!visionResult.charlas || visionResult.charlas.length === 0) {
      return NextResponse.json({
        ok: false,
        message: "No se detectaron charlas en el documento",
        documento: visionResult.documento,
      });
    }

    // 2. Crear job para este documento
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
      console.error("Error creando job:", jobError);
      return NextResponse.json({ error: "Error al crear el trabajo" }, { status: 500 });
    }

    // 3. Guardar el PDF original en Storage (opcional: solo registro si falla)
    const storagePath = `${user.id}/${job.id}/${fileName}`;
    const { data: doc, error: docError } = await supabase
      .from("uploaded_documents")
      .insert({
        job_id: job.id,
        user_id: user.id,
        nombre_archivo: fileName,
        tamano_bytes: totalSize, // aproximado
        mime_type: "application/pdf",
        storage_path: storagePath,
        estado: "procesado",
      })
      .select()
      .single();

    if (docError || !doc) {
      console.error("Error creando documento:", docError);
      return NextResponse.json({ error: "Error al registrar documento" }, { status: 500 });
    }

    // 4. Guardar charlas y participantes con validación de nómina
    const savedTalks = [];
    for (const talk of visionResult.charlas) {
      const duracion = talk.duracion_minutos ?? 20;
      const horaInicio = parseHora(talk.hora_inicio);
      const horaFin = talk.hora_finalizacion
        ? parseHora(talk.hora_finalizacion)
        : calcularFin(horaInicio, duracion);

      const confianza = talk.confianza_general ?? 0.5;
      const requiereRevision =
        talk.requiere_revision || confianza < 0.7 || !talk.fecha_inicio;

      const { data: savedTalk, error: talkError } = await supabase
        .from("safety_talks")
        .insert({
          document_id: doc.id,
          job_id: job.id,
          user_id: user.id,
          nombre_curso: talk.nombre_curso || "Charla sin título",
          descripcion: talk.descripcion || "Charla de Seguridad",
          fecha_inicio: parseFecha(talk.fecha_inicio),
          hora_inicio: horaInicio,
          duracion_minutos: duracion,
          hora_finalizacion: horaFin,
          tipo_entrenamiento: talk.tipo_entrenamiento || "",
          modalidad: talk.modalidad || "",
          idioma: talk.idioma || "",
          creado_por: talk.creado_por || "",
          comentarios: talk.comentarios || "",
          confianza_general: confianza,
          requiere_revision: requiereRevision,
        })
        .select()
        .single();

      if (talkError || !savedTalk) {
        console.error("Error guardando charla:", talkError);
        continue;
      }

      // Participantes con match de nómina
      const participantsSaved = [];
      for (const p of talk.participantes ?? []) {
        const nominaResult = matchNomina(p.nombre_detectado || "");

        const { data: savedP, error: pError } = await supabase
          .from("talk_participants")
          .insert({
            talk_id: savedTalk.id,
            nombre_detectado: p.nombre_detectado || "",
            firma_detectada: p.firma_detectada ?? false,
            confianza_nombre: p.confianza_nombre ?? 0.5,
            confianza_firma: p.confianza_firma ?? 0,
            pagina_evidencia: p.pagina_evidencia ?? 1,
            requiere_revision:
              p.requiere_revision || !nominaResult.approved,
          })
          .select()
          .single();

        if (savedP && !pError) {
          participantsSaved.push({
            id: savedP.id,
            nombre_detectado: savedP.nombre_detectado,
            firma_detectada: savedP.firma_detectada,
            confianza_nombre: savedP.confianza_nombre,
            requiere_revision: savedP.requiere_revision,
            nomina_match: nominaResult.approved,
            nomina_matched_name: nominaResult.matchedName,
            nomina_confidence: nominaResult.confidence,
          });
        }
      }

      savedTalks.push({
        id: savedTalk.id,
        nombre_curso: savedTalk.nombre_curso,
        fecha_inicio: savedTalk.fecha_inicio,
        hora_inicio: savedTalk.hora_inicio,
        hora_finalizacion: savedTalk.hora_finalizacion,
        duracion_minutos: savedTalk.duracion_minutos,
        confianza_general: savedTalk.confianza_general,
        requiere_revision: savedTalk.requiere_revision,
        participantes: participantsSaved,
      });
    }

    // 5. Actualizar job como completado
    await supabase
      .from("processing_jobs")
      .update({
        estado: savedTalks.some((t) => t.requiere_revision)
          ? "requiere_revision"
          : "completado",
        documentos_procesados: 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      documento: visionResult.documento,
      charlas: savedTalks,
    });
  } catch (error) {
    console.error("Analyze API error:", error);
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}