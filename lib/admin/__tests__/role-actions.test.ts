import { beforeEach, expect, it, vi } from "vitest";
import { adminSetUserRole } from "../role-actions";

const mocks = vi.hoisted(() => ({ requireOwner: vi.fn(), rpc: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("../guard", () => ({ requireOwner: mocks.requireOwner }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
const ownerId = "123e4567-e89b-12d3-a456-426614174000";
const targetId = "123e4567-e89b-12d3-a456-426614174001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOwner.mockResolvedValue({ ok: true, user: { id: ownerId }, supabase: { rpc: mocks.rpc } });
  mocks.rpc.mockResolvedValue({ error: null });
});

it.each(["unauthenticated", "forbidden"])("does not mutate roles when the ownership guard returns %s", async (error) => {
  mocks.requireOwner.mockResolvedValue({ ok: false, error });
  expect(await adminSetUserRole(targetId, "admin", "user")).toEqual({ ok: false, error });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each([
  ["invalid", "admin", "user", "invalid-id"],
  [targetId, "owner", "user", "invalid-role"],
  [targetId, null, "user", "invalid-role"],
  [targetId, "admin", "owner", "invalid-role"],
  [ownerId.toUpperCase(), "user", "admin", "owner-protected"],
])("rejects invalid or self-directed role updates (%#)", async (id, role, expectedRole, error) => {
  expect(await adminSetUserRole(id, role, expectedRole)).toEqual({ ok: false, error });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each([["admin", "user"], ["user", "admin"]])("sends a validated %s assignment and refreshes the administration page", async (role, previousRole) => {
  expect(await adminSetUserRole(targetId, role, previousRole)).toEqual({ ok: true });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_set_user_role", {
    target_user_id: targetId, new_role: role, expected_role: previousRole,
  });
  expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/[locale]/admin", "page");
});

it.each([
  ["42501", "private", "forbidden"],
  ["22023", "private", "invalid-role"],
  ["P0002", "private", "user-not-found"],
  ["40001", "private", "role-changed"],
  ["P0001", "OWNER_PROTECTED", "owner-protected"],
  ["P0001", "PRIVATE_DATABASE_DETAIL", "database-error"],
])("maps database refusal to a safe UI error (%s)", async (code, message, error) => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    mocks.rpc.mockResolvedValue({ error: { code, message } });
    expect(await adminSetUserRole(targetId, "admin", "user")).toEqual({ ok: false, error });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE_DATABASE_DETAIL");
  } finally { log.mockRestore(); }
});

it("handles a rejected transport request without exposing the exception", async () => {
  mocks.rpc.mockRejectedValue(new Error("PRIVATE_TRANSPORT_DETAIL"));
  expect(await adminSetUserRole(targetId, "admin", "user")).toEqual({ ok: false, error: "database-error" });
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});
