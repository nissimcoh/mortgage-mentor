"use server";

/**
 * Admin-only Server Actions. Every action re-verifies admin access itself
 * via requireAdmin() (auth.getUser() first, then the database's own
 * is_current_user_admin() check) — never trusts that a request reaching
 * this file came from the admin UI. No service-role key is used anywhere:
 * both mutations below go through admin-only SECURITY DEFINER RPCs
 * (admin_delete_scenario / admin_delete_user) that re-check admin access
 * again themselves, at the database layer, as the real enforcement
 * boundary.
 */

import type { PostgrestError } from "@supabase/supabase-js";
import { isUuidLike } from "../scenarios/payload";
import type { AdminActionFailure } from "./contract";
import { requireAdmin } from "./guard";

function logAdminError(context: string, error: PostgrestError): void {
  console.error(`[admin] ${context}:`, {
    code: /^[A-Z0-9]{5,12}$/.test(error.code) ? error.code : "REQUEST",
  });
}

export type AdminDeleteScenarioResult = { ok: true } | AdminActionFailure;

export async function adminDeleteScenario(
  id: unknown,
): Promise<AdminDeleteScenarioResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  if (!isUuidLike(id)) return { ok: false, error: "invalid-id" };

  const { error } = await guard.supabase.rpc("admin_delete_scenario", {
    target_id: id,
  });
  if (error) {
    logAdminError("adminDeleteScenario failed", error);
    return { ok: false, error: "database-error" };
  }
  return { ok: true };
}

export type AdminDeleteUserResult = { ok: true } | AdminActionFailure;

export async function adminDeleteUser(
  id: unknown,
): Promise<AdminDeleteUserResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  if (!isUuidLike(id)) return { ok: false, error: "invalid-id" };
  // Also enforced by admin_delete_user itself in the database — checked
  // here too so the UI gets the specific, correct error immediately.
  if (id === guard.user.id) return { ok: false, error: "cannot-delete-self" };

  const { error } = await guard.supabase.rpc("admin_delete_user", {
    target_user_id: id,
  });
  if (error) {
    logAdminError("adminDeleteUser failed", error);
    return { ok: false, error: "database-error" };
  }
  return { ok: true };
}
