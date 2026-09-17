import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase session refresh middleware.
 * Refreshes the session token and protects routes that require auth.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and supabase.auth.getUser.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Rutas protegidas: requieren sesión válida
  // BYPASS LOCAL: en desarrollo no exigir login (probar flujo sin sesión)
  const protectedPaths = ["/dashboard", "/api/analyze", "/api/submit", "/api/job-status"];
  const isProtected = protectedPaths.some((p) =>
    request.nextUrl.pathname.startsWith(p),
  );
  const isLocalhost = request.nextUrl.hostname === "localhost" ||
    request.nextUrl.hostname === "127.0.0.1";

  if (!user && isProtected && !isLocalhost) {
    // Las rutas API responden 401 JSON; las páginas redirigen a /login
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}