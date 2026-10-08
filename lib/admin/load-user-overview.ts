import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { buildUserOverview, type AdminUserMetadata, type ScenarioActivityMetadata } from "./user-overview";

type Client = Awaited<ReturnType<typeof createClient>>;
const PAGE_SIZE = 500;

function parseRow(value: unknown, isUser: boolean): AdminUserMetadata | ScenarioActivityMetadata {
  if (!value || typeof value !== "object") throw new Error("admin-metadata-invalid");
  const row = value as Record<string, unknown>;
  const validDate = (date: unknown): date is string => typeof date === "string" && Number.isFinite(Date.parse(date));
  if (isUser && typeof row.id === "string" &&
      (row.email === null || typeof row.email === "string") && validDate(row.created_at) &&
      (row.last_sign_in_at === null || validDate(row.last_sign_in_at))) {
    return { id: row.id, email: row.email, created_at: row.created_at, last_sign_in_at: row.last_sign_in_at };
  }
  if (!isUser && typeof row.user_id === "string" && validDate(row.updated_at)) {
    return { user_id: row.user_id, updated_at: row.updated_at };
  }
  throw new Error("admin-metadata-invalid");
}

/** Existing guarded RPCs, with an explicit column projection. No scenario
 * name, identifier, financial inputs or results leave the database here.
 * Page through every result; never report a truncated first page as totals.
 * Keep raw metadata server-side and pass only per-user aggregates to the UI.
 */
async function readMetadata(client: Client, table: "users"): Promise<AdminUserMetadata[]>;
async function readMetadata(client: Client, table: "scenarios"): Promise<ScenarioActivityMetadata[]>;
async function readMetadata(client: Client, table: "users" | "scenarios") {
  const rows: (AdminUserMetadata | ScenarioActivityMetadata)[] = [];
  const isUsers = table === "users";
  let expectedCount: number | null = null;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error, count } = await client
      .rpc(isUsers ? "admin_list_users" : "admin_list_scenarios", {}, { count: "exact" })
      .select(isUsers ? "id,email,created_at,last_sign_in_at" : "user_id,updated_at")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error || !Array.isArray(data) || typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
      throw new Error("admin-metadata-unavailable");
    }
    if (expectedCount !== null && expectedCount !== count) throw new Error("admin-metadata-changed");
    expectedCount = count;
    rows.push(...data.map((row: unknown) => parseRow(row, isUsers)));
    if (rows.length === count) return rows;
    if (rows.length > count) throw new Error("admin-metadata-incomplete");
    // A server row cap smaller than requested must not silently undercount.
    if (data.length !== PAGE_SIZE) throw new Error("admin-metadata-incomplete");
  }
}

export async function loadUserOverview(client: Client, currentUserId: string, now = Date.now()) {
  const [users, scenarios] = await Promise.all([
    readMetadata(client, "users"), readMetadata(client, "scenarios"),
  ]);
  return buildUserOverview(users, scenarios, now, currentUserId);
}
