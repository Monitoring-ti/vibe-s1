// =============================================================================
// Edge Function: generate-excel
// =============================================================================
// Receives a job_id, reads the extracted data from safety_talks and
// talk_participants, loads the Excel template from Storage, generates
// the completed Excel file (filling only the "Datos" tab), uploads the
// result to Storage, and returns a signed URL for download.
// =============================================================================

import { corsHeaders, handleCorsPreflight, jsonResponse, errorResponse } from '../_shared/cors.ts';
import {
  Workbook,
  Alignment,
  Fill,
  Border,
  Side,
} from 'https://esm.sh/exceljs@4.4.0';

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const SUPABASE_URL =
  Deno.env.get('SUPABASE_URL') ||
  Deno.env.get('NEXT_PUBLIC_SUPABASE_URL') ||
  '';
const SUPABASE_SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_KEY') ||
  '';
const SUPABASE_ANON_KEY =
  Deno.env.get('SUPABASE_ANON_KEY') ||
  Deno.env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
  '';

const STORAGE_BUCKET =
  Deno.env.get('STORAGE_BUCKET_NAME') || 'charlas-pdfs';
const TEMPLATE_PATH = Deno.env.get('EXCEL_TEMPLATE_PATH') || 'templates/plantilla_charlas.xlsx';
const OUTPUT_BUCKET =
  Deno.env.get('EXCEL_OUTPUT_BUCKET') || 'charlas-exports';

// SIGNED URL TTL in seconds (1 hour)
const SIGNED_URL_TTL = 3600;

// -----------------------------------------------------------------------------
// Logging
// -----------------------------------------------------------------------------

function log(
  level: 'info' | 'warn' | 'error',
  message: string,
  data?: Record<string, unknown>,
) {
  console[level](
    JSON.stringify({
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(data || {}),
    }),
  );
}

// -----------------------------------------------------------------------------
// Supabase helpers
// -----------------------------------------------------------------------------

function supabaseHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY}`,
    apikey: SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };
}

async function supabaseFetch(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<any> {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      ...supabaseHeaders(),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Supabase API ${response.status}: ${errText}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function downloadFromStorage(
  bucket: string,
  path: string,
): Promise<ArrayBuffer> {
  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download ${path}: ${response.status} ${response.statusText}`,
    );
  }

  return response.arrayBuffer();
}

async function uploadToStorage(
  bucket: string,
  path: string,
  data: Uint8Array,
  contentType: string,
): Promise<void> {
  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: data,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Failed to upload to ${path}: ${response.status} ${errText}`,
    );
  }
}

async function createSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number = SIGNED_URL_TTL,
): Promise<string> {
  const url = `${SUPABASE_URL}/storage/v1/object/create-signed-url`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...supabaseHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      bucket_id: bucket,
      object_id: path,
      expiresIn,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create signed URL: ${response.status}`);
  }

  const data = await response.json();
  if (!data.signedURL) {
    throw new Error('No signed URL returned');
  }

  return data.signedURL;
}

// -----------------------------------------------------------------------------
// Data types (mirror database schema)
// -----------------------------------------------------------------------------

interface SafetyTalkRow {
  id: string;
  job_id: string;
  document_id: string;
  course_name: string;
  talk_date: string | null;
  talk_time: string | null;
  duration_minutes: number | null;
  talk_type: string | null;
  modality: string | null;
  language: string | null;
  instructor: string | null;
  location: string | null;
  comments: string | null;
  confidence_score: number;
  requires_review: boolean;
}

interface TalkParticipantRow {
  id: string;
  talk_id: string;
  detected_name: string;
  normalized_name: string;
  rut: string | null;
  company: string | null;
  role: string | null;
  signature_detected: boolean;
  confidence_score: number;
  name_matches_nomina: boolean;
  nomina_match_score: number | null;
  nomina_matched_name: string | null;
}

// -----------------------------------------------------------------------------
// Excel Generation
// -----------------------------------------------------------------------------

/**
 * Column definitions for the "Datos" sheet.
 * Mirrors src/lib/excel/template.ts
 */
interface ExcelColumn {
  header: string;
  key: string;
  width: number;
}

const PARTICIPANT_COLUMNS: ExcelColumn[] = [
  { header: 'ID Charla', key: 'talkId', width: 36 },
  { header: 'Nombre del Curso', key: 'courseName', width: 40 },
  { header: 'Fecha', key: 'talkDate', width: 15 },
  { header: 'Hora', key: 'talkTime', width: 10 },
  { header: 'Duración (min)', key: 'durationMinutes', width: 14 },
  { header: 'Tipo', key: 'talkType', width: 12 },
  { header: 'Modalidad', key: 'modality', width: 12 },
  { header: 'Idioma', key: 'language', width: 10 },
  { header: 'Instructor', key: 'instructor', width: 25 },
  { header: 'Lugar', key: 'location', width: 25 },
  { header: 'Nombre Completo', key: 'fullName', width: 35 },
  { header: 'Nombre Normalizado', key: 'normalizedName', width: 35 },
  { header: 'RUT', key: 'rut', width: 15 },
  { header: 'Empresa', key: 'company', width: 25 },
  { header: 'Cargo', key: 'role', width: 20 },
  { header: 'Firma Detectada', key: 'signatureDetected', width: 15 },
  { header: 'Confianza (%)', key: 'confidenceScore', width: 14 },
  { header: 'Coincide Nómina', key: 'matchesNomina', width: 16 },
  { header: 'Score Nómina (%)', key: 'nominaMatchScore', width: 16 },
  { header: 'Comentarios', key: 'comments', width: 30 },
];

/**
 * Generate the Excel workbook from the extracted data.
 * If a template exists in Storage, loads it and fills only the "Datos" tab.
 * Otherwise, creates a new workbook with the required sheets.
 */
async function generateExcelWorkbook(
  talks: SafetyTalkRow[],
  participants: TalkParticipantRow[],
  jobId: string,
): Promise<Uint8Array> {
  let workbook: Workbook;

  // Try to load the template from Storage
  let hasTemplate = false;
  try {
    const templateBuffer = await downloadFromStorage(
      STORAGE_BUCKET,
      TEMPLATE_PATH,
    );
    workbook = new Workbook();
    await workbook.xlsx.load(templateBuffer);
    hasTemplate = true;
    log('info', 'Excel template loaded from Storage', { hasTemplate });
  } catch (error) {
    log('warn', 'No Excel template found, creating from scratch', {
      error: String(error),
      templatePath: TEMPLATE_PATH,
    });
    workbook = new Workbook();
    workbook.creator = 'Plataforma de Charlas de Seguridad';
    workbook.created = new Date();
  }

  // Get or create the "Datos" sheet
  let datosSheet = workbook.getWorksheet('Datos');
  if (!datosSheet) {
    // If the template has a different name, try "Datos" as is
    datosSheet = workbook.addWorksheet('Datos', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    hasTemplate = false;
  }

  // If no template, set up columns
  if (!hasTemplate || datosSheet.rowCount <= 1) {
    datosSheet.columns = PARTICIPANT_COLUMNS.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width,
    }));

    // Style header row
    const headerRow = datosSheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    };
    headerRow.alignment = {
      vertical: 'middle',
      horizontal: 'center',
    };
    headerRow.height = 22;
  }

  // Build a map of talk_id -> talk for quick lookup
  const talkMap = new Map<string, SafetyTalkRow>();
  for (const talk of talks) {
    talkMap.set(talk.id, talk);
  }

  // Group participants by talk
  const participantsByTalk = new Map<
    string,
    TalkParticipantRow[]
  >();
  for (const p of participants) {
    if (!participantsByTalk.has(p.talk_id)) {
      participantsByTalk.set(p.talk_id, []);
    }
    participantsByTalk.get(p.talk_id)!.push(p);
  }

  // Clear existing data rows (if template, keep header)
  if (hasTemplate && datosSheet.rowCount > 1) {
    // Remove all rows after the header
    for (let i = datosSheet.rowCount; i > 1; i--) {
      datosSheet.spliceRows(i, 1);
    }
  }

  // Fill the "Datos" sheet with data rows — one row per participant per talk
  let rowIndex = 2; // Start after header

  for (const talk of talks) {
    const talkParticipants = participantsByTalk.get(talk.id) ?? [];

    if (talkParticipants.length === 0) {
      // Still add a row for the talk even if no participants
      datosSheet.addRow({
        talkId: talk.id,
        courseName: talk.course_name,
        talkDate: talk.talk_date || '',
        talkTime: talk.talk_time || '',
        durationMinutes: talk.duration_minutes || '',
        talkType: talk.talk_type || '',
        modality: talk.modality || '',
        language: talk.language || '',
        instructor: talk.instructor || '',
        location: talk.location || '',
        fullName: '(sin participantes)',
        normalizedName: '',
        rut: '',
        company: '',
        role: '',
        signatureDetected: '',
        confidenceScore: '',
        matchesNomina: '',
        nominaMatchScore: '',
        comments: talk.comments || '',
      });
      rowIndex++;
    } else {
      for (const p of talkParticipants) {
        datosSheet.addRow({
          talkId: talk.id,
          courseName: talk.course_name,
          talkDate: talk.talk_date || '',
          talkTime: talk.talk_time || '',
          durationMinutes: talk.duration_minutes || '',
          talkType: talk.talk_type || '',
          modality: talk.modality || '',
          language: talk.language || '',
          instructor: talk.instructor || '',
          location: talk.location || '',
          fullName: p.detected_name,
          normalizedName: p.normalized_name,
          rut: p.rut || '',
          company: p.company || '',
          role: p.role || '',
          signatureDetected: p.signature_detected ? 'Sí' : 'No',
          confidenceScore: Math.round(p.confidence_score * 100),
          matchesNomina: p.name_matches_nomina ? 'Sí' : 'No',
          nominaMatchScore: p.nomina_match_score
            ? Math.round(p.nomina_match_score * 100)
            : '',
          comments: talk.comments || '',
        });
        rowIndex++;
      }
    }
  }

  // Color rows: yellow for name mismatch, red for low confidence
  const thinBorder: Partial<Border> = {
    top: { style: 'thin' as const, color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin' as const, color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin' as const, color: { argb: 'FFD1D5DB' } },
  };

  for (let i = 2; i <= datosSheet.rowCount; i++) {
    const row = datosSheet.getRow(i);
    row.border = thinBorder as Border;

    // Check if this row has a name mismatch (column R = "Coincide Nómina")
    const matchesNominaCell = row.getCell(18); // Column R (1-indexed)
    const confidenceCell = row.getCell(17); // Column Q

    if (matchesNominaCell.value === 'No') {
      row.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEF3C7' },
        } as Fill;
      });
    }

    const confValue = confidenceCell.value as number;
    if (typeof confValue === 'number' && confValue < 50) {
      row.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEE2E2' },
        } as Fill;
      });
    }
  }

  // Auto-filter on the data range
  const lastCol = PARTICIPANT_COLUMNS.length;
  datosSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: datosSheet.rowCount, column: lastCol },
  };

  // Add a summary sheet
  const summarySheet =
    workbook.getWorksheet('Resumen') ||
    workbook.addWorksheet('Resumen', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

  summarySheet.columns = [
    { header: 'Métrica', key: 'metric', width: 35 },
    { header: 'Valor', key: 'value', width: 20 },
  ];

  const headerRow = summarySheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2563EB' },
  };

  const totalAlerts = participants.filter((p) => !p.name_matches_nomina).length;
  const avgConfidence =
    participants.length > 0
      ? Math.round(
          (participants.reduce((s, p) => s + p.confidence_score, 0) /
            participants.length) *
            100,
        )
      : 0;

  summarySheet.addRow({ metric: 'Job ID', value: jobId });
  summarySheet.addRow({
    metric: 'Total de Charlas',
    value: talks.length,
  });
  summarySheet.addRow({
    metric: 'Total de Participantes',
    value: participants.length,
  });
  summarySheet.addRow({
    metric: 'Nombres que no coinciden con nómina',
    value: totalAlerts,
  });
  summarySheet.addRow({
    metric: 'Confianza promedio (%)',
    value: avgConfidence,
  });
  summarySheet.addRow({
    metric: 'Fecha de generación',
    value: new Date().toISOString(),
  });

  // Convert to buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

// -----------------------------------------------------------------------------
// Edge Function Entry Point
// -----------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // CORS preflight
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  // Validate required environment variables
  if (!SUPABASE_URL) {
    return errorResponse('SUPABASE_URL not configured', 500);
  }

  let body: { job_id?: string };

  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { job_id } = body;

  if (!job_id) {
    return errorResponse('Missing required field: job_id', 400);
  }

  log('info', 'generate-excel invoked', { jobId: job_id });

  try {
    // 1. Fetch all talks for this job
    const talks = (await supabaseFetch(
      `/safety_talks?job_id=eq.${job_id}&select=*`,
    )) as SafetyTalkRow[];

    if (!talks || talks.length === 0) {
      return errorResponse(
        'No hay charlas extraídas para este job. Procesa documentos primero.',
        404,
      );
    }

    log('info', 'Fetched talks from database', {
      count: talks.length,
      jobId: job_id,
    });

    // 2. Fetch all participants for these talks
    const talkIds = talks.map((t) => t.id);
    const talkIdsFilter = talkIds.map((id) => `"${id}"`).join(',');

    const participants = (await supabaseFetch(
      `/talk_participants?talk_id=in.(${talkIdsFilter})&select=*`,
    )) as TalkParticipantRow[];

    log('info', 'Fetched participants', {
      count: participants.length,
      jobId: job_id,
    });

    // 3. Generate the Excel workbook
    log('info', 'Generating Excel workbook', { jobId: job_id });
    const excelBuffer = await generateExcelWorkbook(
      talks,
      participants,
      job_id,
    );

    // 4. Upload to Storage
    const outputPath = `exports/${job_id}/charlas_seguridad_${new Date().toISOString().split('T')[0]}.xlsx`;

    log('info', 'Uploading Excel to Storage', {
      bucket: OUTPUT_BUCKET,
      path: outputPath,
      size: excelBuffer.byteLength,
    });

    await uploadToStorage(
      OUTPUT_BUCKET,
      outputPath,
      excelBuffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    // 5. Create a signed URL for download
    const signedUrl = await createSignedUrl(OUTPUT_BUCKET, outputPath, SIGNED_URL_TTL);

    log('info', 'Excel generation complete', {
      jobId: job_id,
      downloadUrl: signedUrl,
    });

    return jsonResponse({
      success: true,
      job_id,
      download_url: signedUrl,
      file_path: outputPath,
      expires_in: SIGNED_URL_TTL,
      stats: {
        total_talks: talks.length,
        total_participants: participants.length,
        file_size_bytes: excelBuffer.byteLength,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    log('error', 'Excel generation failed', {
      jobId: job_id,
      error: errorMessage,
    });

    return jsonResponse(
      {
        success: false,
        error: errorMessage,
        job_id,
      },
      500,
    );
  }
});
