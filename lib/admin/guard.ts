import "server-only";

import type { User } from "@supabase/supabase-js";
import { createClient } from "../supabase/server";
import type { AdminActionFailure } from "./contract";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type AdminGuardResult =
  | { ok: true; supabase: SupabaseServerClient; user: User }
  | AdminActionFailure;

/**
 * Verifies the caller is signed in AND holds admin access, via the
 * database's own is_current_user_admin() function (see
 * supabase/migrations/20260916120000_admin_access.sql) — the fixed,
 * version-controlled admin-email allowlist lives there, not duplicated
 * here or in an environment variable. Never uses a service-role key:
 * this runs the same RLS-bound client every other Server Action uses,
 * and is_current_user_admin() only reads the caller's own JWT.
 *
 * Callers get back the already-authenticated Supabase client so a
 * successful guard can be followed directly by an .rpc()/.from() call
 * without creating a second client.
 */
export async function requireAdmin(): Promise<AdminGuardResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { data: isAdmin, error } = await supabase.rpc(
    "is_current_user_admin",
  );
  if (error) {
    console.error("[admin] is_current_user_admin check failed:", {
      code: error.code,
      message: error.message,
      hint: error.hint,
    });
    return { ok: false, error: "forbidden" };
  }
  if (isAdmin !== true) return { ok: false, error: "forbidden" };

  return { ok: true, supabase, user };
}
