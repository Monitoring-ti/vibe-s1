import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./server";

/**
 * Cliente de desarrollo: en localhost sin sesión, usa el usuario admin
 * sembrado y service-role (bypass RLS) para probar el flujo completo
 * sin login. En producción siempre exige sesión real.
 */

const DEV_USER_ID = process.env.DEV_USER_ID || "6d82302e-e049-4f7d-b1d0-279e2886e212";

export async function getUserOrDev() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return { supabase, user, isDevBypass: false };
  }

  if (process.env.NODE_ENV === "development") {
    const admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    return {
      supabase: admin as unknown as SupabaseClient,
      user: { id: DEV_USER_ID, email: "dev@local" },
      isDevBypass: true,
    };
  }

  return { supabase, user: null, isDevBypass: false };
}