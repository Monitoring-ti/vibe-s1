/**
 * Supabase client barrel file.
 *
 * Re-exports the browser client and shared constants so that
 * `import { supabase, TABLES, STORAGE_BUCKETS } from '@/lib/supabase'` works.
 */
export { createClient, getSupabaseBrowserClient } from "./client";

import { createBrowserClient } from "@supabase/ssr";

// ---------------------------------------------------------------------------
// Singleton browser client (for client-side usage)
// ---------------------------------------------------------------------------
let _client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseClient() {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return _client;
}

// For components that import { supabase } directly
export const supabase = getSupabaseClient();

// ---------------------------------------------------------------------------
// Table names
// ---------------------------------------------------------------------------
export const TABLES = {
  PROFILES: "profiles",
  PROCESSING_JOBS: "processing_jobs",
  UPLOADED_DOCUMENTS: "uploaded_documents",
  SAFETY_TALKS: "safety_talks",
  PARTICIPANTS: "participants",
  TALK_PARTICIPANTS: "talk_participants",
  EXTRACTION_EVIDENCE: "extraction_evidence",
  VALIDATION_ISSUES: "validation_issues",
  GENERATED_REPORTS: "generated_reports",
  PROCESSED_DOCUMENTS: "uploaded_documents", // alias
  VALIDATION_ALERTS: "validation_issues", // alias
} as const;

// ---------------------------------------------------------------------------
// Storage bucket names
// ---------------------------------------------------------------------------
export const STORAGE_BUCKETS = {
  PDFS: "charlas-pdfs",
  DOCUMENTS: "charlas-pdfs", // alias
} as const;
