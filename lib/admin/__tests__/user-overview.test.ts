import { expect, it, vi } from "vitest";
import { buildUserOverview, type AdminUserMetadata } from "../user-overview";
import { loadUserOverview } from "../load-user-overview";

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

it("paginates metadata and does not silently truncate counts at the API row limit", async () => {
  const ranges: number[] = [];
  const selects: string[] = [];
  const rpc = vi.fn((name: string) => {
    const data = name === "admin_list_users" ? [user("a")] : Array.from({ length: 1001 }, () => ({ user_id: "a", updated_at: ago(1) }));
    const chain = {
      select: (columns: string) => { selects.push(columns); return chain; },
      order: () => chain,
      range: async (start: number, end: number) => { if (name === "admin_list_scenarios") ranges.push(start); return { data: data.slice(start, end + 1), count: data.length, error: null }; },
    };
    return chain;
  });
  const rows = await loadUserOverview({ rpc } as unknown as Parameters<typeof loadUserOverview>[0], "owner", now);
  expect(rows[0].savedCount).toBe(1001);
  expect(ranges).toEqual([0, 500, 1000]);
  expect(new Set(selects)).toEqual(new Set(["id,email,created_at,last_sign_in_at", "user_id,updated_at"]));
});

it("fails closed on partial metadata instead of recommending deletion using a false zero", async () => {
  const chain = { select: () => chain, order: () => chain, range: async () => ({ data: [], count: 10, error: null }) };
  await expect(loadUserOverview({ rpc: () => chain } as unknown as Parameters<typeof loadUserOverview>[0], "owner", now)).rejects.toThrow("incomplete");
});
