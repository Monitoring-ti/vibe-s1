// =============================================================================
// Tipos TypeScript - Plataforma de Charlas de Seguridad
// =============================================================================

// -----------------------------------------------------------------------------
// Enums / Union Types
// -----------------------------------------------------------------------------

export type JobStatus =
  | 'pending'
  | 'uploading'
  | 'extracting'
  | 'ocr'
  | 'hermes'
  | 'validating'
  | 'generating'
  | 'review'
  | 'completed'
  | 'failed'
  // Spanish aliases from DB
  | 'pendiente'
  | 'procesando'
  | 'requiere_revision'
  | 'completado'
  | 'error';

export type DocumentStatus =
  | 'uploaded'
  | 'text_extracted'
  | 'ocr_processed'
  | 'hermes_processed'
  | 'validated'
  | 'excel_generated'
  | 'completed'
  | 'processing'
  | 'pending'
  | 'failed'
  | 'error';

export type UserRole =
  | 'admin'
  | 'supervisor'
  | 'viewer';

export type ValidationType =
  | 'schema'
  | 'nomina'
  | 'schedule'
  | 'date'
  | 'time'
  | 'duration';

export type Severity =
  | 'critical'
  | 'warning'
  | 'info';

// -----------------------------------------------------------------------------
// Hermes
// -----------------------------------------------------------------------------

export interface HermesConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  maxRetries?: number;
  temperature?: number;
  maxTokens?: number;
}

export interface HermesMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface HermesResponse {
  content: string;
  parsed: unknown;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  elapsedMs: number;
  requestId?: string;
}

// -----------------------------------------------------------------------------
// Perfil / Usuario
// -----------------------------------------------------------------------------

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// -----------------------------------------------------------------------------
// Documentos / Jobs
// -----------------------------------------------------------------------------

export interface UploadedDocument {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  buffer?: Buffer;
  text?: string;
  hasText?: boolean;
  pages?: number;
  status: DocumentStatus;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessingJob {
  id: string;
  documentId: string;
  status: JobStatus;
  progress: number;
  currentStep?: string;
  error?: string;
  error_message?: string; // alias
  result?: {
    talks?: SafetyTalk[];
    reportPath?: string;
  };
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  // Aliases for DB column names
  created_at?: string;
  updated_at?: string;
  total_documentos: number;
  documentos_procesados: number;
  processed_documents: number; // alias
  total_documents: number; // alias
  user_id?: string;
}

// Alias used by some components
export interface ProcessedDocument extends UploadedDocument {
  job_id?: string;
  talkCount?: number;
  participantCount?: number;
  alerts?: ValidationAlert[];
  file_name?: string;
  file_size?: number;
  is_scanned?: boolean;
  processing_status?: string;
  talk_count?: number;
  participant_count?: number;
  error_message?: string;
  storage_path?: string;
}

// -----------------------------------------------------------------------------
// Charlas de Seguridad
// -----------------------------------------------------------------------------

export interface Participant {
  id?: string;
  fullName: string;
  normalized?: string;
  documentId?: string;
  role?: string;
  confidence?: number;
}

export interface TalkParticipant {
  id: string;
  talk_id?: string;
  participant_id?: string;
  // Fields used by UI components
  detected_name: string;
  normalized_name: string;
  rut?: string;
  signature_detected: boolean;
  confidence_score: number;
  name_matches_nomina: boolean;
  requires_review?: boolean;
  // Fields used by core logic
  participant?: Participant;
  confidence?: number;
  evidence?: ExtractionEvidence;
  nombre_detectado?: string;
  nombre_normalizado?: string;
  firma_detectada?: boolean;
  confianza_nombre?: number;
  confianza_firma?: number;
  pagina_evidencia?: number;
  nomina_match_score?: number;
}

export interface ExtractionEvidence {
  page?: number;
  contextText?: string;
  bbox?: { x: number; y: number; width: number; height: number };
}

export interface SafetyTalk {
  id: string;
  // DB field names
  document_id?: string;
  job_id?: string;
  user_id?: string;
  // UI component field names
  course_name: string;
  talk_date: string;
  talk_time: string;
  duration_minutes: number;
  talk_type: string;
  modality: string;
  language: string;
  instructor: string;
  comments: string;
  requires_review: boolean;
  confidence_score: number;
  participants?: TalkParticipant[];
  // Core logic field names (aliases)
  topic?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  location?: string;
  confidence?: number;
  issues?: ValidationIssue[];
  division?: string;
  // Additional fields from the spec
  nombre_curso?: string;
  descripcion?: string;
  fecha_inicio?: string;
  hora_inicio?: string;
  hora_finalizacion?: string;
  tipo_entrenamiento?: string;
  modalidad?: string;
  idioma?: string;
  creado_por?: string;
  comentarios?: string;
  duracion_minutos?: number;
  confianza_general?: number;
  // DB-style alias for participants
  participantes?: TalkParticipant[];
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

export interface ValidationIssue {
  id: string;
  type: ValidationType;
  severity: Severity;
  message: string;
  field?: string;
  talkId?: string;
  participantName?: string;
  suggestion?: string;
}

// Alias used by some components
export interface ValidationAlert {
  id: string;
  code?: string;
  severity: 'error' | 'warning' | 'info';
  participantId?: string;
  message: string;
  field?: string;
  resolved?: boolean;
  talk_id?: string;
  alert_type?: 'name_not_found' | 'schedule_conflict' | 'missing_field' | 'low_confidence' | 'unreadable_signature';
}

// -----------------------------------------------------------------------------
// Reportes
// -----------------------------------------------------------------------------

export interface GeneratedReport {
  id: string;
  jobIds: string[];
  talks: SafetyTalk[];
  filePath: string;
  fileName: string;
  totalTalks: number;
  totalParticipants: number;
  generatedAt: string;
  issues?: ValidationIssue[];
}

// -----------------------------------------------------------------------------
// Database types (for Supabase)
// -----------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile>;
        Update: Partial<Profile>;
      };
      processing_jobs: {
        Row: ProcessingJob;
        Insert: Partial<ProcessingJob>;
        Update: Partial<ProcessingJob>;
      };
      uploaded_documents: {
        Row: UploadedDocument;
        Insert: Partial<UploadedDocument>;
        Update: Partial<UploadedDocument>;
      };
      safety_talks: {
        Row: SafetyTalk;
        Insert: Partial<SafetyTalk>;
        Update: Partial<SafetyTalk>;
      };
      participants: {
        Row: Participant;
        Insert: Partial<Participant>;
        Update: Partial<Participant>;
      };
      talk_participants: {
        Row: TalkParticipant;
        Insert: Partial<TalkParticipant>;
        Update: Partial<TalkParticipant>;
      };
    };
  };
}

// Alias for the extraction result
export type HermesExtractionResult = HermesResponse;

// Página de PDF renderizada a imagen (en el navegador, con pdf.js)
export interface RenderedPage {
  pageNumber: number;
  base64: string;
  width: number;
  height: number;
}

// Esquema que devuelve el modelo de visión (español, según especificación)
export interface VisionParticipant {
  nombre_detectado: string;
  nombre_normalizado?: string;
  firma_detectada: boolean;
  confianza_nombre: number;
  confianza_firma: number;
  pagina_evidencia: number;
  requiere_revision: boolean;
}

export interface VisionTalk {
  nombre_curso: string;
  descripcion: string;
  fecha_inicio: string | null;
  hora_inicio: string | null;
  duracion_minutos: number;
  hora_finalizacion: string | null;
  tipo_entrenamiento: string | null;
  modalidad: string | null;
  idioma: string | null;
  creado_por: string | null;
  comentarios: string | null;
  participantes: VisionParticipant[];
  confianza_general: number;
  requiere_revision: boolean;
}

export interface VisionExtractionResult {
  documento: {
    archivo: string;
    estado_extraccion: string;
    observaciones: string[];
  };
  charlas: VisionTalk[];
}

export interface Job {
  id: string;
  fileName: string;
  fileSize?: number;
  createdAt: string;
  status?: JobStatus;
  // Spanish aliases from DB
  estado?: JobStatus;
  created_at?: string;
  updated_at?: string;
  total_documentos?: number;
  documentos_procesados?: number;
  total_documents?: number; // alias
  processed_documents?: number; // alias
  nombre_archivo?: string;
  participants: Array<Participant & {
    id: string;
    rut?: string;
    company?: string;
    role?: string;
    checkInTime?: string;
    checkOutTime?: string;
    matchedNomina?: boolean;
    matchConfidence?: number;
    source?: string;
    fullName: string;
  }>;
  alerts: ValidationAlert[];
}
