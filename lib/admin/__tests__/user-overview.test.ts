import { expect, it, vi } from "vitest";
import { buildUserOverview, type AdminUserMetadata } from "../user-overview";
import { loadUserOverview, parseUsageSnapshot } from "../load-user-overview";

vi.mock("server-only", () => ({}));
const now = Date.parse("2026-10-08T12:00:00Z");
const day = 86_400_000;
const ago = (days: number) => new Date(now - days * day).toISOString();
const user = (id: string, days: number | null = 200): AdminUserMetadata => ({
  id, email: `${id}@example.test`, created_at: ago(365), last_sign_in_at: days === null ? null : ago(days),
});

it("counts by owner and uses the newest sign-in or retained save without exposing content", () => {
  const result = buildUserOverview([user("a"), user("b", 2)], [
    { user_id: "a", updated_at: ago(4) }, { user_id: "a", updated_at: ago(1) },
    { user_id: "b", updated_at: ago(100) },
  ], now, "owner");
  expect(result[0]).toMatchObject({ savedCount: 2, lastSaveAt: ago(1), lastRecordedActivityAt: ago(1), daysSinceActivity: 1, status: "recent", reviewSuggested: false });
  expect(result[1]).toMatchObject({ savedCount: 1, lastSaveAt: ago(100), lastRecordedActivityAt: ago(2) });
});

it("handles activity thresholds and null sign-in without assuming live presence", () => {
  const rows = buildUserOverview([user("a", 30), user("b", 31), user("c", 90), user("d", 91), user("e", null)], [], now, "owner");
  expect(rows.map(row => row.status)).toEqual(["recent", "older", "older", "quiet", "unknown"]);
  expect(rows[4].daysSinceActivity).toBeNull();
});

it("only suggests review for old empty accounts and excludes the current administrator", () => {
  const rows = buildUserOverview([
    user("old"), user("owner"), user("saved"), user("recent", 179),
    { ...user("new", null), created_at: ago(1) }, user("never", null), user("boundary", 180),
  ], [{ user_id: "saved", updated_at: ago(200) }], now, "owner");
  expect(rows.filter(row => row.reviewSuggested).map(row => row.id)).toEqual(["old", "never", "boundary"]);
});

const usage = (id = "owner", savedCount = 0) => ({
  ...user(id), saved_count: savedCount, last_save_at: savedCount ? ago(1) : null,
});
const snapshot = (users = [usage()]) => ({
  users, total_users: users.length, total_saved: users.reduce((sum, row) => sum + row.saved_count, 0),
});
const client = (rpc: ReturnType<typeof vi.fn>) => ({ rpc }) as unknown as Parameters<typeof loadUserOverview>[0];

it("loads one aggregate snapshot without depending on count headers or API row caps", async () => {
  const data = snapshot(Array.from({ length: 1001 }, (_, i) => usage(i === 0 ? "owner" : `user-${i}`, i === 0 ? 1001 : 0)));
  const rpc = vi.fn().mockResolvedValue({ data, error: null, count: null });
  const rows = await loadUserOverview(client(rpc), "owner", now);
  expect(rows).toHaveLength(1001);
  expect(rows[0]).toMatchObject({ savedCount: 1001, lastSaveAt: ago(1), isCurrentUser: true });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("admin_usage_snapshot");
});

it("retains all registered accounts even when no scenarios are saved", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: snapshot([usage(), usage("other")]), error: null });
  const rows = await loadUserOverview(client(rpc), "owner", now);
  expect(rows.map(row => row.savedCount)).toEqual([0, 0]);
  expect(rows[0].reviewSuggested).toBe(false);
});

it.each([
  { ...snapshot(), total_users: 2 },
  { ...snapshot(), total_saved: 1 },
  snapshot([usage(), usage()]),
  snapshot([{ ...usage(), saved_count: -1 }]),
  snapshot([{ ...usage(), saved_count: 1.5 }]),
  snapshot([{ ...usage(), saved_count: Number.MAX_SAFE_INTEGER + 1 }]),
  snapshot([{ ...usage(), created_at: "invalid" }]),
  snapshot([{ ...usage(), last_sign_in_at: "invalid" }]),
  snapshot([{ ...usage(), last_save_at: ago(1) }]),
  snapshot([{ ...usage(), saved_count: 1 }]),
  { users: null, total_users: 0, total_saved: 0 },
  null,
])("rejects inconsistent or invalid snapshots instead of showing misleading totals (%#)", (data) => {
  expect(() => parseUsageSnapshot(data)).toThrow(/^ADMIN_/);
});

it("discards unexpected fields before data reaches the interface", () => {
  const data = { ...snapshot(), users: [{ ...usage(), name: "PRIVATE_NAME", input_payload: { amount: "PRIVATE_AMOUNT" } }], secret: "PRIVATE" };
  expect(parseUsageSnapshot(data)).toEqual([usage()]);
});

it("requires the current authorized account to be present", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: snapshot([usage("other")]), error: null });
  await expect(loadUserOverview(client(rpc), "owner", now)).rejects.toThrow("ADMIN_ACCOUNT_MISSING");
});

it.each(["42501", "bad code with private details"])("reports only a bounded diagnostic for RPC failures (%s)", async (code) => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { code, message: "PRIVATE_DATABASE_DETAIL" } });
  await expect(loadUserOverview(client(rpc), "owner", now)).rejects.toThrow(code === "42501" ? "ADMIN_RPC_42501" : "ADMIN_RPC_REQUEST");
});
