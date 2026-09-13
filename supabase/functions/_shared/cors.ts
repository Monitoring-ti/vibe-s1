// =============================================================================
// Shared CORS headers for Supabase Edge Functions
// =============================================================================

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

/**
 * Handle CORS preflight requests.
 * Returns a Response for OPTIONS, or null if not a preflight.
 */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 });
  }
  return null;
}

/**
 * Wrap a JSON response with CORS headers.
 */
export function jsonResponse(
  body: unknown,
  status: number = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

/**
 * Wrap an error JSON response with CORS headers.
 */
export function errorResponse(
  message: string,
  status: number = 400,
  extra?: Record<string, unknown>,
): Response {
  return jsonResponse({ error: message, ...extra }, status);
}
