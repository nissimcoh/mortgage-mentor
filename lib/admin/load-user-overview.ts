import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { buildUserOverviewFromAggregates, type AdminUsageMetadata } from "./user-overview";
import { isUserRole } from "./roles";

type Client = Awaited<ReturnType<typeof createClient>>;

export class AdminOverviewError extends Error {
  constructor(readonly diagnostic: string) {
    super(diagnostic);
    this.name = "AdminOverviewError";
  }
}

const validDate = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const validCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Validate the database snapshot, not transport headers. An empty saved list
 * never hides accounts. Reject partial/inconsistent data rather than show a
 * false zero, and discard any unexpected fields before passing data to React.
 */
export function parseUsageSnapshot(value: unknown): AdminUsageMetadata[] {
  if (!value || typeof value !== "object") throw new AdminOverviewError("ADMIN_SHAPE");
  const snapshot = value as Record<string, unknown>;
  if (!Array.isArray(snapshot.users) || !validCount(snapshot.total_users) || !validCount(snapshot.total_saved)) {
    throw new AdminOverviewError("ADMIN_SHAPE");
  }
  const ids = new Set<string>();
  const users = snapshot.users.map((value: unknown): AdminUsageMetadata => {
    if (!value || typeof value !== "object") throw new AdminOverviewError("ADMIN_ROW");
    const row = value as Record<string, unknown>;
    if (!isUserRole(row.role) || typeof row.id !== "string" || !row.id || ids.has(row.id) ||
        !(row.email === null || typeof row.email === "string") || !validDate(row.created_at) ||
        !(row.last_sign_in_at === null || validDate(row.last_sign_in_at)) || !validCount(row.saved_count) ||
        !(row.last_save_at === null || validDate(row.last_save_at)) ||
        (row.saved_count === 0 && row.last_save_at !== null) || (row.saved_count > 0 && row.last_save_at === null)) {
      throw new AdminOverviewError("ADMIN_ROW");
    }
    ids.add(row.id);
    return { id: row.id, role: row.role, email: row.email, created_at: row.created_at, last_sign_in_at: row.last_sign_in_at,
      saved_count: row.saved_count, last_save_at: row.last_save_at };
  });
  if (users.length !== snapshot.total_users || users.reduce((sum, user) => sum + user.saved_count, 0) !== snapshot.total_saved) {
    throw new AdminOverviewError("ADMIN_TOTALS");
  }
  return users;
}

export async function loadUserOverview(client: Client, currentUserId: string, now = Date.now()) {
  const { data, error } = await client.rpc("admin_usage_snapshot");
  if (error) {
    const code = /^[A-Z0-9]{5,12}$/.test(error.code ?? "") ? error.code : "REQUEST";
    throw new AdminOverviewError(`ADMIN_RPC_${code}`);
  }
  const users = parseUsageSnapshot(data);
  if (!users.some(user => user.id === currentUserId)) throw new AdminOverviewError("ADMIN_ACCOUNT_MISSING");
  return buildUserOverviewFromAggregates(users, now, currentUserId);
}
