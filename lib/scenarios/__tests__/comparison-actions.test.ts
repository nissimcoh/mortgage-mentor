import { beforeEach, expect, it, vi } from "vitest";
import { loadComparisonPayments } from "../comparison-actions";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), in: vi.fn(), load: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }) }));
vi.mock("../load-comparison", () => ({ COMPARISON_COLUMNS: "columns", loadComparisonScenarios: mocks.load }));

const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "authenticated-owner" } } });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ in: mocks.in });
  mocks.in.mockResolvedValue({ data: [{ id: A }], error: null });
  mocks.load.mockResolvedValue([{ id: A, payments: [1, 2] }]);
});

it.each([[[]], [[A, B, A, B]], [["not-a-uuid"]], ["text"], [null]])("rejects malformed input %j without touching auth or the database", async ids => {
  expect(await loadComparisonPayments(ids)).toBeNull();
  expect(mocks.getUser).not.toHaveBeenCalled();
  expect(mocks.from).not.toHaveBeenCalled();
});

it("requires a session before any database read", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  expect(await loadComparisonPayments([A])).toBeNull();
  expect(mocks.from).not.toHaveBeenCalled();
});

it("scopes rows to the caller and reports foreign or unknown IDs as unavailable", async () => {
  expect(await loadComparisonPayments([A, B])).toEqual({ [A]: [1, 2], [B]: null });
  expect(mocks.eq).toHaveBeenCalledWith("user_id", "authenticated-owner");
  expect(mocks.in).toHaveBeenCalledWith("id", [A, B]);
  expect(mocks.load).toHaveBeenCalledWith([{ id: A }], [A, B]);
});

it("hides database errors", async () => {
  mocks.in.mockResolvedValue({ data: null, error: { message: "internal detail" } });
  expect(await loadComparisonPayments([A])).toBeNull();
});
