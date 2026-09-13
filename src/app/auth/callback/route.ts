import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback
 * Intercambia el código OAuth (Google) por una sesión de Supabase
 * y redirige al destino original.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  let next = searchParams.get("next") ?? "/dashboard";
  if (!next.startsWith("/")) next = "/dashboard";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("Error intercambiando código OAuth:", error.message);
  }

  // Sin código o con error: volver al login con mensaje
  return NextResponse.redirect(`${origin}/login?error=oauth`);
}