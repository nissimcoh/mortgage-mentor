"use server";

import { revalidatePath } from "next/cache";
import { isUuidLike } from "../scenarios/payload";
import { requireOwner } from "./guard";
import { isAssignableRole, type RoleActionResult } from "./roles";

/** Every call checks ownership server-side and again in the database RPC. */
export async function adminSetUserRole(
  id: unknown, role: unknown, expectedRole: unknown,
): Promise<RoleActionResult> {
  const guard = await requireOwner();
  if (!guard.ok) return { ok: false, error: guard.error === "unauthenticated" ? "unauthenticated" : "forbidden" };
  if (!isUuidLike(id)) return { ok: false, error: "invalid-id" };
  if (!isAssignableRole(role) || !isAssignableRole(expectedRole)) return { ok: false, error: "invalid-role" };
  if (id.toLowerCase() === guard.user.id.toLowerCase()) return { ok: false, error: "owner-protected" };
  try {
    const { error } = await guard.supabase.rpc("admin_set_user_role", {
      target_user_id: id, new_role: role, expected_role: expectedRole,
    });
    if (error) {
      if (error.code === "42501") return { ok: false, error: "forbidden" };
      if (error.code === "22023") return { ok: false, error: "invalid-role" };
      if (error.code === "P0002") return { ok: false, error: "user-not-found" };
      if (error.code === "40001") return { ok: false, error: "role-changed" };
      if (error.code === "P0001" && error.message === "OWNER_PROTECTED") return { ok: false, error: "owner-protected" };
      console.error("[admin] role update failed", { code: /^[A-Z0-9]{5,12}$/.test(error.code ?? "") ? error.code : "REQUEST" });
      return { ok: false, error: "database-error" };
    }
  } catch {
    return { ok: false, error: "database-error" };
  }
  revalidatePath("/[locale]/admin", "page");
  return { ok: true };
}
