import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback
 * Intercambia el código OAuth (Google) por una sesión de Supabase
 * y redirige al destino original.
 * Registra el error real en los logs de Vercel para diagnóstico.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  let next = searchParams.get("next") ?? "/dashboard";
  if (!next.startsWith("/")) next = "/dashboard";

  // Supabase puede devolver errores en el callback (ej: error=server_error)
  const oauthError = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const errorCode = searchParams.get("error_code");

  if (oauthError || errorCode) {
    console.error("[auth/callback] Error de Supabase:", {
      error: oauthError,
      code: errorCode,
      description: errorDescription,
    });
    return NextResponse.redirect(
      `${origin}/login?error=oauth&reason=${encodeURIComponent(errorCode || oauthError || "")}&desc=${encodeURIComponent(errorDescription || "")}`,
    );
  }

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("[auth/callback] exchangeCodeForSession:", error.message);
      return NextResponse.redirect(
        `${origin}/login?error=oauth&reason=exchange&desc=${encodeURIComponent(error.message)}`,
      );
    }

    return NextResponse.redirect(`${origin}${next}`);
  }

  console.error("[auth/callback] Sin código ni error en la URL");
  return NextResponse.redirect(`${origin}/login?error=oauth&reason=nocode`);
}