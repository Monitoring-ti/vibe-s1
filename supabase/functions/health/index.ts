// =============================================================================
// Edge Function: health
// Simple health-check endpoint for uptime monitoring and load balancer probes.
// =============================================================================

import { corsHeaders, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';

interface HealthStatus {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: string;
  version: string;
  services: Record<string, 'ok' | 'unavailable'>;
}

const START_TIME = Date.now();

Deno.serve(async (req: Request) => {
  // CORS preflight
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'GET') {
    return jsonResponse(
      { error: 'Method not allowed' },
      405,
    );
  }

  const uptimeMs = Date.now() - START_TIME;
  const seconds = Math.floor(uptimeMs / 1000) % 60;
  const minutes = Math.floor(uptimeMs / 60000) % 60;
  const hours = Math.floor(uptimeMs / 3600000);

  const health: HealthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: `${hours}h ${minutes}m ${seconds}s`,
    version: '1.0.0',
    services: {
      edge_function: 'ok',
      // These would be checked at runtime if needed:
      // supabase: Deno.env.get('SUPABASE_URL') ? 'ok' : 'unavailable',
      // hermes: Deno.env.get('HERMES_API_KEY') ? 'ok' : 'unavailable',
    },
  };

  // Check if critical env vars exist
  const hasSupabaseUrl = !!Deno.env.get('SUPABASE_URL') || !!Deno.env.get('NEXT_PUBLIC_SUPABASE_URL');
  const hasHermesKey = !!Deno.env.get('HERMES_API_KEY');

  health.services.supabase = hasSupabaseUrl ? 'ok' : 'unavailable';
  health.services.hermes = hasHermesKey ? 'ok' : 'unavailable';

  if (!hasSupabaseUrl) {
    health.status = 'degraded';
  }

  return jsonResponse(health, health.status === 'ok' ? 200 : 503);
});
