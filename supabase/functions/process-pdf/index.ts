// =============================================================================
// Edge Function: process-pdf
// =============================================================================
// Receives a job_id and document_id, downloads the PDF from Supabase Storage,
// detects whether it has embedded text or is scanned, extracts text or
// applies OCR, sanitizes the text against prompt injection, calls Hermes AI
// with the structured prompt, validates the JSON response with Zod, saves
// the extracted data to safety_talks and talk_participants, validates names
// against nómina, detects schedule conflicts, updates the job and document
// status, and handles errors with structured logging.
// =============================================================================

import { corsHeaders, handleCorsPreflight, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

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

const HERMES_ENDPOINT =
  Deno.env.get('HERMES_API_ENDPOINT') ||
  'https://api.hermes.nousresearch.com/v1/chat/completions';
const HERMES_API_KEY = Deno.env.get('HERMES_API_KEY') || '';
const HERMES_MODEL = Deno.env.get('HERMES_MODEL') || 'z-ai/glm-5.2';

const STORAGE_BUCKET =
  Deno.env.get('STORAGE_BUCKET_NAME') || 'charlas-pdfs';
const OCR_LANGUAGE = Deno.env.get('OCR_LANGUAGE') || 'spa';

// Nómina autorizada — same list as src/lib/validation/nomina.ts
const NOMINA_AUTORIZADA: readonly string[] = [
  'CACERES MENDOZA MAURICIO AUGUSTO',
  'CONTRERAS TORDECILLA GUILLERMO ENRIQUE',
  'CORTES CORTES DIEGO ALBERTO',
  'FLORES CHAPARRO SANTIAGO JONATHAN',
  'MAUREIRA ASTUDILLO JAVIER ORLANDO',
  'PEREZ ACUNA VILMA ROSSANA',
  'VILLALOBOS NUNEZ DANIEL MAURICIO',
  'ZAVALA ARAYA CRISTIAN FELIPE',
];

const NOMINA_THRESHOLD = 0.82;

// -----------------------------------------------------------------------------
// Zod Schema (mirrors src/lib/validation/schema.ts)
// -----------------------------------------------------------------------------

const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;

const participantSchema = z.object({
  fullName: z.string().min(2),
  rut: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const talkSchema = z.object({
  talkTitle: z.string().min(1),
  talkDate: z.string().nullable().optional(),
  talkLocation: z.string().nullable().optional(),
  instructor: z.string().nullable().optional(),
  durationMinutes: z.number().int().positive().max(600).nullable().optional(),
  participants: z.array(participantSchema),
  rawText: z.string().optional(),
});

const hermesResponseSchema = z.object({
  talks: z.array(talkSchema).min(1),
});

type ParsedTalk = z.infer<typeof talkSchema>;
type ParsedParticipant = z.infer<typeof participantSchema>;
type ParsedHermesResponse = z.infer<typeof hermesResponseSchema>;

// -----------------------------------------------------------------------------
// Logging
// -----------------------------------------------------------------------------

interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  jobId?: string;
  documentId?: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

function log(
  level: LogEntry['level'],
  message: string,
  jobId?: string,
  documentId?: string,
  data?: Record<string, unknown>,
) {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
  };
  if (jobId) entry.jobId = jobId;
  if (documentId) entry.documentId = documentId;
  if (data) entry.data = data;
  // Use stderr for logs — Supabase captures these in the function logs
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
    JSON.stringify(entry),
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
      Prefer: options.method === 'POST' ? 'return=representation' : 'return=minimal',
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
): Promise<Uint8Array> {
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

  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

async function updateDocument(
  documentId: string,
  updates: Record<string, unknown>,
) {
  return supabaseFetch(`/documents?id=eq.${documentId}`, {
    method: 'PATCH',
    body: updates,
  });
}

async function updateJob(jobId: string, updates: Record<string, unknown>) {
  return supabaseFetch(`/processing_jobs?id=eq.${jobId}`, {
    method: 'PATCH',
    body: updates,
  });
}

// -----------------------------------------------------------------------------
// PDF Text Extraction (Deno-native)
// -----------------------------------------------------------------------------

/**
 * Extract text from a PDF using Deno-native approach.
 * Uses pdf-lib to parse and extract text, or falls back to a simple
 * text extraction approach.
 *
 * In production, you would use a library like pdf-lib or call an external
 * PDF parsing service. Here we use a lightweight approach that works in
 * the Deno runtime.
 */

async function extractPdfText(
  pdfBytes: Uint8Array,
): Promise<{ text: string; pageCount: number; hasText: boolean }> {
  // Decode the PDF as text and look for text content streams.
  // This is a simplified approach — in production, use a proper PDF library.
  const decoder = new TextDecoder('latin1');
  const rawString = decoder.decode(pdfBytes);

  // Count pages
  const pageMatches = rawString.match(/\/Type\s*\/Page\b/g);
  const pageCount = pageMatches ? pageMatches.length : 1;

  // Try to extract text from BT...ET blocks (text objects)
  const textBlocks: string[] = [];
  const btEtRegex = /BT\s*(.*?)\s*ET/gs;
  let match: RegExpExecArray | null;

  while ((match = btEtRegex.exec(rawString)) !== null) {
    const block = match[1];
    // Extract text from Tj and TJ operators
    const tjRegex = /\((.*?)\)\s*Tj/gs;
    const tjArrayRegex = /\[(.*?)\]\s*TJ/gs;

    let tjMatch: RegExpExecArray | null;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      textBlocks.push(tjMatch[1].replace(/\\[nrt()\\]/g, ' '));
    }

    while ((tjMatch = tjArrayRegex.exec(block)) !== null) {
      // TJ arrays contain strings and numbers
      const parts = tjMatch[1].match(/\((.*?)\)/g);
      if (parts) {
        textBlocks.push(
          parts.map((p) => p.replace(/[()]/g, '')).join(''),
        );
      }
    }
  }

  const text = textBlocks.join('\n').trim();
  const hasText = text.length >= 50;

  return { text, pageCount, hasText };
}

// -----------------------------------------------------------------------------
// OCR fallback (external API integration)
// -----------------------------------------------------------------------------

/**
 * Perform OCR on a scanned PDF using an external OCR service.
 * Supported services: Google Cloud Vision, AWS Textract, Azure Computer Vision,
 * or a custom OCR API endpoint.
 */

async function performOcr(
  pdfBytes: Uint8Array,
  pageCount: number,
): Promise<string> {
  const ocrProvider = Deno.env.get('OCR_PROVIDER') || 'mock';
  const ocrApiKey = Deno.env.get('OCR_API_KEY');
  const ocrEndpoint = Deno.env.get('OCR_API_ENDPOINT');

  log('info', `OCR invoked for ${pageCount} pages using provider: ${ocrProvider}`, undefined, undefined, { provider: ocrProvider });

  switch (ocrProvider) {
    case 'google-vision':
      return await ocrGoogleVision(pdfBytes, ocrApiKey);
    case 'aws-textract':
      return await ocrAwsTextract(pdfBytes, ocrApiKey);
    case 'azure-vision':
      return await ocrAzureVision(pdfBytes, ocrApiKey, ocrEndpoint);
    case 'custom':
      return await ocrCustom(pdfBytes, ocrApiKey, ocrEndpoint);
    default:
      log('warn', 'No OCR provider configured or using mock — returning empty text');
      return '';
  }
}

/**
 * Google Cloud Vision OCR
 */
async function ocrGoogleVision(pdfBytes: Uint8Array, apiKey: string | undefined): Promise<string> {
  if (!apiKey) {
    log('error', 'Google Vision API key not configured');
    return '';
  }

  // Convert PDF to images (first page only for simplicity)
  // In production, use pdf-lib + canvas or a service like pdf2pic
  const base64Pdf = btoa(String.fromCharCode(...pdfBytes));

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64Pdf },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            imageContext: { languageHints: ['es', 'en'] },
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const err = await response.text();
    log('error', `Google Vision OCR failed: ${err}`);
    return '';
  }

  const data = await response.json();
  const text = data.responses?.[0]?.fullTextAnnotation?.text || '';
  return text;
}

/**
 * AWS Textract OCR (async - returns job ID, would need polling)
 */
async function ocrAwsTextract(pdfBytes: Uint8Array, apiKey: string | undefined): Promise<string> {
  if (!apiKey) {
    log('error', 'AWS Textract credentials not configured');
    return '';
  }
  // AWS Textract requires async processing for PDFs
  // Simplified: return placeholder
  log('warn', 'AWS Textract async processing not fully implemented');
  return '';
}

/**
 * Azure Computer Vision OCR
 */
async function ocrAzureVision(
  pdfBytes: Uint8Array,
  apiKey: string | undefined,
  endpoint: string | undefined,
): Promise<string> {
  if (!apiKey || !endpoint) {
    log('error', 'Azure Vision credentials not configured');
    return '';
  }

  const base64Pdf = btoa(String.fromCharCode(...pdfBytes));

  const response = await fetch(`${endpoint}/vision/v3.2/read/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': apiKey,
    },
    body: JSON.stringify({ image: base64Pdf }),
  });

  if (!response.ok) {
    const err = await response.text();
    log('error', `Azure Vision OCR failed: ${err}`);
    return '';
  }

  const operationLocation = response.headers.get('Operation-Location');
  if (!operationLocation) return '';

  // Poll for result
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const resultRes = await fetch(operationLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': apiKey },
    });
    const result = await resultRes.json();
    if (result.status === 'succeeded') {
      return result.analyzeResult?.readResults?.map((r: any) => r.lines?.map((l: any) => l.text).join(' ')).join('\n') || '';
    }
    if (result.status === 'failed') break;
  }
  return '';
}

/**
 * Custom OCR API
 */
async function ocrCustom(pdfBytes: Uint8Array, apiKey: string | undefined, endpoint: string | undefined): Promise<string> {
  if (!apiKey || !endpoint) {
    log('error', 'Custom OCR endpoint or key not configured');
    return '';
  }

  const base64Pdf = btoa(String.fromCharCode(...pdfBytes));

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ pdf: base64Pdf }),
  });

  if (!response.ok) {
    const err = await response.text();
    log('error', `Custom OCR failed: ${err}`);
    return '';
  }

  const data = await response.json();
  return data.text || data.extractedText || '';
}

// -----------------------------------------------------------------------------
// Text Sanitization (prevent prompt injection)
// -----------------------------------------------------------------------------

/**
 * Sanitize extracted text to prevent prompt injection attacks.
 *
 * Strategy:
 * - Remove common prompt injection patterns ("ignore previous instructions", etc.)
 * - Escape special characters that could be interpreted as commands
 * - Truncate to a reasonable length
 * - Wrap in clear delimiters
 */

const INJECTION_PATTERNS = [
  /ignore\s+(previous|all|above)\s+(instructions?|prompts?)/gi,
  /disregard\s+(previous|all|above)\s+/gi,
  /you\s+are\s+(now|actually)\s+/gi,
  /system\s*:\s*/gi,
  /assistant\s*:\s*/gi,
  /\bNEW\s+INSTRUCTION\b/gi,
  /\bROLE\s*:\s*/gi,
  /<\/?(script|iframe|embed|object)/gi,
];

const MAX_TEXT_LENGTH = 50000;

function sanitizeText(text: string): string {
  let sanitized = text;

  // Remove injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[FILTERED]');
  }

  // Remove null bytes and control characters (except newlines and tabs)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Truncate if too long
  if (sanitized.length > MAX_TEXT_LENGTH) {
    sanitized = sanitized.substring(0, MAX_TEXT_LENGTH) + '\n[... TRUNCADO ...]';
  }

  return sanitized.trim();
}

// -----------------------------------------------------------------------------
// Hermes AI Call
// -----------------------------------------------------------------------------

const EXTRACTION_SYSTEM_PROMPT = `Eres un experto en procesamiento de actas de charlas de seguridad ocupacional en Chile.

Tu tarea es analizar el texto extraído de un PDF (que puede venir de OCR) y devolver un objeto JSON con la siguiente estructura:

{
  "talks": [
    {
      "talkTitle": string,
      "talkDate": string (formato DD/MM/AAAA, ej: "15/03/2024"),
      "talkLocation": string (opcional),
      "instructor": string (opcional),
      "durationMinutes": number (opcional),
      "participants": [
        {
          "fullName": string,
          "rut": string (formato 12345678-9, opcional),
          "company": string (empresa o contratista, opcional),
          "role": string (cargo, opcional),
          "confidence": number (0-1, confianza de extracción)
        }
      ]
    }
  ]
}

Reglas importantes:
1. Devuelve SOLO el JSON válido, sin markdown, sin explicaciones.
2. Si un campo no está presente en el texto, usa null o omítelo.
3. Normaliza los RUT al formato 12345678-9 (sin puntos).
4. Los nombres deben estar en formato "Nombre Apellido" o como aparezcan.
5. Si hay múltiples charlas en el documento, inclúyelas todas en el array "talks".
6. Si el texto proviene de OCR y tiene errores, intenta corregir nombres obvios.
7. Asigna un score de confianza (0-1) a cada participante basado en la claridad del texto.
8. NO inventes datos que no estén en el texto. Si no hay información, usa null.`;

interface HermesApiResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

async function callHermes(sanitizedText: string): Promise<ParsedHermesResponse> {
  log('info', 'Calling Hermes AI for extraction');

  const response = await fetch(HERMES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${HERMES_API_KEY}`,
    },
    body: JSON.stringify({
      model: HERMES_MODEL,
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Analiza el siguiente texto extraído de un acta de charla de seguridad y extrae los datos estructurados:\n\n--- INICIO DEL TEXTO ---\n${sanitizedText}\n--- FIN DEL TEXTO ---`,
        },
      ],
      temperature: 0.1,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Hermes API error ${response.status}: ${errText}`);
  }

  const apiData = (await response.json()) as HermesApiResponse;
  const content = apiData.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Hermes API returned empty content');
  }

  // Parse the JSON content
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (parseError) {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*(.*?)\s*```/s);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error(`Failed to parse Hermes response as JSON: ${parseError}`);
    }
  }

  // Validate with Zod
  const validationResult = hermesResponseSchema.safeParse(parsed);
  if (!validationResult.success) {
    const errorDetails = validationResult.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Hermes response validation failed: ${errorDetails}`);
  }

  return validationResult.data;
}

// -----------------------------------------------------------------------------
// Nómina Name Validation (mirrors src/lib/validation/nomina.ts)
// -----------------------------------------------------------------------------

function normalizeName(name: string): string {
  if (!name) return '';
  let result = name.toUpperCase().trim();
  const TILDE_MAP: Record<string, string> = {
    Á: 'A', À: 'A', É: 'E', È: 'E', Í: 'I', Ì: 'I',
    Ó: 'O', Ò: 'O', Ú: 'U', Ù: 'U', Ñ: 'N', Ü: 'U',
    á: 'A', à: 'A', é: 'E', è: 'E', í: 'I', ì: 'I',
    ó: 'O', ò: 'O', ú: 'U', ù: 'U', ñ: 'N', ü: 'U',
  };
  result = result.replace(/[ÁÀÉÈÍÌÓÒÚÙÑÜáàéèíìóòúùñü]/g, (c) => TILDE_MAP[c] ?? c);
  result = result.replace(/\s+/g, ' ');
  result = result.replace(/[^A-Z\s]/g, ' ');
  result = result.replace(/\s+/g, ' ').trim();
  return result;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function similarityScore(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function compareNames(nameA: string, nameB: string): number {
  const normA = normalizeName(nameA);
  const normB = normalizeName(nameB);
  if (!normA || !normB) return 0;
  return similarityScore(normA, normB);
}

interface NominaMatchResult {
  normalized: string;
  matchedName: string | null;
  confidence: number;
  approved: boolean;
}

function matchNomina(extractedName: string): NominaMatchResult {
  const normalized = normalizeName(extractedName);
  if (!normalized) {
    return { normalized: '', matchedName: null, confidence: 0, approved: false };
  }
  let bestMatch: string | null = null;
  let bestScore = 0;
  for (const nominaName of NOMINA_AUTORIZADA) {
    const score = compareNames(normalized, nominaName);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = nominaName;
    }
  }
  return {
    normalized,
    matchedName: bestMatch,
    confidence: bestScore,
    approved: bestScore >= NOMINA_THRESHOLD,
  };
}

// -----------------------------------------------------------------------------
// Schedule Conflict Detection (mirrors src/lib/validation/schedule.ts)
// -----------------------------------------------------------------------------

interface ScheduleConflict {
  talkId: string;
  participantName: string;
  conflictWith: string;
  message: string;
}

function detectScheduleConflicts(
  talks: Array<{
    id: string;
    talk_date: string | null;
    talk_time: string | null;
    duration_minutes: number | null;
    participants: Array<{ normalized_name: string }>;
  }>,
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  // Group by date and participant
  const slotsByDateParticipant = new Map<
    string,
    Map<string, Array<{ talkId: string; start: number; end: number }>>
  >();

  for (const talk of talks) {
    if (!talk.talk_date || !talk.talk_time) continue;

    // Parse time HH:MM to minutes
    const timeMatch = talk.talk_time.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch) continue;
    const startMinutes = parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]);
    const duration = talk.duration_minutes ?? 20;
    const endMinutes = startMinutes + duration;

    for (const participant of talk.participants) {
      const name = participant.normalized_name;
      if (!name) continue;

      const dateKey = talk.talk_date;
      if (!slotsByDateParticipant.has(dateKey)) {
        slotsByDateParticipant.set(dateKey, new Map());
      }
      const dateMap = slotsByDateParticipant.get(dateKey)!;
      if (!dateMap.has(name)) {
        dateMap.set(name, []);
      }
      dateMap.get(name)!.push({
        talkId: talk.id,
        start: startMinutes,
        end: endMinutes,
      });
    }
  }

  // Check for overlaps
  for (const [_date, participantMap] of slotsByDateParticipant) {
    for (const [name, slots] of participantMap) {
      const sorted = [...slots].sort((a, b) => a.start - b.start);
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          if (sorted[i].start < sorted[j].end && sorted[j].start < sorted[i].end) {
            conflicts.push({
              talkId: sorted[j].talkId,
              participantName: name,
              conflictWith: sorted[i].talkId,
              message: `Superposición de horario: ${name} tiene charlas que se solapan el mismo día.`,
            });
          }
        }
      }
    }
  }

  return conflicts;
}

// -----------------------------------------------------------------------------
// Main Processing Pipeline
// -----------------------------------------------------------------------------

async function processDocument(
  jobId: string,
  documentId: string,
): Promise<void> {
  log('info', 'Starting document processing', jobId, documentId);

  // 1. Fetch the document record to get the storage path
  const docRecords = await supabaseFetch(
    `/documents?id=eq.${documentId}&select=*`,
  );

  if (!docRecords || docRecords.length === 0) {
    throw new Error(`Document ${documentId} not found`);
  }

  const doc = docRecords[0];
  const storagePath = doc.storage_path || `documents/${documentId}.pdf`;

  // 2. Update document status to processing
  await updateDocument(documentId, {
    status: 'text_extracted',
    updated_at: new Date().toISOString(),
  });

  // 3. Download PDF from Storage
  log('info', 'Downloading PDF from Storage', jobId, documentId, {
    path: storagePath,
    bucket: STORAGE_BUCKET,
  });

  const pdfBytes = await downloadFromStorage(STORAGE_BUCKET, storagePath);

  // 4. Extract text or detect scanned
  log('info', 'Extracting text from PDF', jobId, documentId);
  const { text, pageCount, hasText } = await extractPdfText(pdfBytes);

  let finalText = text;

  if (!hasText) {
    // Update document — it's a scanned PDF, needs OCR
    await updateDocument(documentId, {
      is_scanned: true,
      status: 'ocr_processed',
      updated_at: new Date().toISOString(),
    });

    log('warn', 'PDF appears to be scanned, applying OCR', jobId, documentId, {
      pageCount,
    });

    finalText = await performOcr(pdfBytes, pageCount);
  } else {
    await updateDocument(documentId, {
      is_scanned: false,
      page_count: pageCount,
      status: 'text_extracted',
      updated_at: new Date().toISOString(),
    });
  }

  // 5. Sanitize text (prevent prompt injection)
  log('info', 'Sanitizing extracted text', jobId, documentId, {
    originalLength: finalText.length,
  });
  const sanitizedText = sanitizeText(finalText);

  if (!sanitizedText || sanitizedText.length < 10) {
    log('warn', 'No usable text after sanitization', jobId, documentId);
    throw new Error(
      'No se pudo extraer texto útil del PDF. El documento podría estar corrupto o ser una imagen no legible.',
    );
  }

  // 6. Call Hermes AI
  await updateDocument(documentId, {
    status: 'hermes_processed',
    updated_at: new Date().toISOString(),
  });

  const hermesResult = await callHermes(sanitizedText);

  log('info', 'Hermes extraction complete', jobId, documentId, {
    talksFound: hermesResult.talks.length,
  });

  // 7. Save extracted data to database
  const talksToInsert: Record<string, unknown>[] = [];
  const participantsToInsert: Record<string, unknown>[] = [];
  const alertsToInsert: Record<string, unknown>[] = [];

  for (const [talkIndex, talk] of hermesResult.talks.entries()) {
    const talkId = crypto.randomUUID();
    const talkConfidence = talk.participants.length > 0
      ? talk.participants.reduce((sum, p) => sum + (p.confidence ?? 0.7), 0) /
        talk.participants.length
      : 0.5;

    const requiresReview = talkConfidence < 0.7 || !talk.talkDate ||
      talk.participants.length === 0;

    talksToInsert.push({
      id: talkId,
      job_id: jobId,
      document_id: documentId,
      course_name: talk.talkTitle,
      talk_date: talk.talkDate,
      talk_time: null, // Will be set if available
      duration_minutes: talk.durationMinutes ?? null,
      talk_type: 'presencial', // default
      modality: 'charla',
      language: 'es',
      instructor: talk.instructor ?? null,
      location: talk.talkLocation ?? null,
      comments: null,
      confidence_score: talkConfidence,
      requires_review: requiresReview,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    for (const participant of talk.participants) {
      const participantId = crypto.randomUUID();
      const nominaResult = matchNomina(participant.fullName);

      participantsToInsert.push({
        id: participantId,
        talk_id: talkId,
        detected_name: participant.fullName,
        normalized_name: nominaResult.normalized,
        rut: participant.rut ?? null,
        company: participant.company ?? null,
        role: participant.role ?? null,
        signature_detected: false, // Would be detected from PDF analysis
        confidence_score: participant.confidence ?? 0.7,
        name_matches_nomina: nominaResult.approved,
        nomina_match_score: nominaResult.confidence,
        nomina_matched_name: nominaResult.matchedName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Generate validation alert if name doesn't match nómina
      if (!nominaResult.approved) {
        alertsToInsert.push({
          id: crypto.randomUUID(),
          job_id: jobId,
          talk_id: talkId,
          alert_type: 'name_not_found',
          severity: 'warning',
          message: `El nombre "${participant.fullName}" no coincide con la nómina autorizada. Mejor coincidencia: ${nominaResult.matchedName ?? 'ninguna'} (${Math.round(nominaResult.confidence * 100)}%).`,
          resolved: false,
          created_at: new Date().toISOString(),
        });
      }

      // Alert for low confidence
      if ((participant.confidence ?? 0.7) < 0.5) {
        alertsToInsert.push({
          id: crypto.randomUUID(),
          job_id: jobId,
          talk_id: talkId,
          alert_type: 'low_confidence',
          severity: 'warning',
          message: `Baja confianza en la detección del participante "${participant.fullName}" (${Math.round((participant.confidence ?? 0) * 100)}%).`,
          resolved: false,
          created_at: new Date().toISOString(),
        });
      }
    }

    // Alert for missing fields
    if (!talk.talkDate) {
      alertsToInsert.push({
        id: crypto.randomUUID(),
        job_id: jobId,
        talk_id: talkId,
        alert_type: 'missing_field',
        severity: 'error',
        message: `La charla "${talk.talkTitle}" no tiene fecha detectada.`,
        resolved: false,
        created_at: new Date().toISOString(),
      });
    }
  }

  // 8. Insert talks
  if (talksToInsert.length > 0) {
    log('info', 'Inserting talks into database', jobId, documentId, {
      count: talksToInsert.length,
    });
    await supabaseFetch('/safety_talks', {
      method: 'POST',
      body: talksToInsert,
    });
  }

  // 9. Insert participants
  if (participantsToInsert.length > 0) {
    log('info', 'Inserting participants', jobId, documentId, {
      count: participantsToInsert.length,
    });
    await supabaseFetch('/talk_participants', {
      method: 'POST',
      body: participantsToInsert,
    });
  }

  // 10. Insert validation alerts
  if (alertsToInsert.length > 0) {
    log('info', 'Inserting validation alerts', jobId, documentId, {
      count: alertsToInsert.length,
    });
    await supabaseFetch('/validation_alerts', {
      method: 'POST',
      body: alertsToInsert,
    });
  }

  // 11. Detect schedule conflicts
  const talksForSchedule = talksToInsert.map((t) => ({
    id: t.id as string,
    talk_date: (t.talk_date as string) || null,
    talk_time: (t.talk_time as string) || null,
    duration_minutes: (t.duration_minutes as number) || null,
    participants: participantsToInsert
      .filter((p) => p.talk_id === t.id)
      .map((p) => ({
        normalized_name: p.normalized_name as string,
      })),
  }));

  const conflicts = detectScheduleConflicts(talksForSchedule);
  if (conflicts.length > 0) {
    log('warn', 'Schedule conflicts detected', jobId, documentId, {
      count: conflicts.length,
    });

    const conflictAlerts = conflicts.map((c) => ({
      id: crypto.randomUUID(),
      job_id: jobId,
      talk_id: c.talkId,
      alert_type: 'schedule_conflict',
      severity: 'error',
      message: c.message,
      resolved: false,
      created_at: new Date().toISOString(),
    }));

    await supabaseFetch('/validation_alerts', {
      method: 'POST',
      body: conflictAlerts,
    });
  }

  // 12. Update document as completed
  await updateDocument(documentId, {
    status: 'validated',
    processed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  log('info', 'Document processing complete', jobId, documentId, {
    talksExtracted: talksToInsert.length,
    participantsExtracted: participantsToInsert.length,
    alertsGenerated: alertsToInsert.length + conflicts.length,
  });
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
  if (!HERMES_API_KEY) {
    return errorResponse('HERMES_API_KEY not configured', 500);
  }

  let body: { job_id?: string; document_id?: string };

  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { job_id, document_id } = body;

  if (!job_id || !document_id) {
    return errorResponse('Missing required fields: job_id, document_id', 400);
  }

  log('info', 'Process-pdf invoked', job_id, document_id);

  try {
    // Update job status to processing
    await updateJob(job_id, {
      status: 'processing',
      updated_at: new Date().toISOString(),
    });

    // Process the document
    await processDocument(job_id, document_id);

    // Update job status to review (ready for human review)
    await updateJob(job_id, {
      status: 'review',
      updated_at: new Date().toISOString(),
    });

    return jsonResponse({
      success: true,
      job_id,
      document_id,
      message: 'Document processed successfully. Ready for review.',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    log('error', 'Processing failed', job_id, document_id, {
      error: errorMessage,
    });

    // Update job and document with error
    try {
      await updateJob(job_id, {
        status: 'failed',
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      });
      await updateDocument(document_id, {
        status: 'error',
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      });
    } catch (updateError) {
      log(
        'error',
        'Failed to update error status',
        job_id,
        document_id,
        { updateError: String(updateError) },
      );
    }

    return jsonResponse(
      {
        success: false,
        error: errorMessage,
        job_id,
        document_id,
      },
      500,
    );
  }
});
