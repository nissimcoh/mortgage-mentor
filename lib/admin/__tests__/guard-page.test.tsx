import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import he from "../../../app/[locale]/dictionaries/he.json";
import { overviewLabels } from "../overview-labels";
import { requireAdmin } from "../guard";
import AdminPage from "../../../app/[locale]/admin/page";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), select: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }) }));
vi.mock("@/app/[locale]/dictionaries", () => ({ getDictionary: async () => he }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); }, notFound: () => { throw new Error("not-found"); } }));

function query(data: unknown[] = [], error: unknown = null) {
  const builder = {
    select: (columns: string) => { mocks.select(columns); return builder; },
    order: () => builder,
    range: async () => ({ data, count: data.length, error }),
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "synthetic-owner" } } });
  mocks.rpc.mockImplementation((name: string) => name === "is_current_user_admin" ? Promise.resolve({ data: true, error: null }) : query());
});

it("requires authentication before checking admin status or listing rows", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  await expect(AdminPage({ params: Promise.resolve({ locale: "he" }) })).rejects.toThrow("redirect:/he/signin?next=%2Fhe%2Fadmin");
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each([false, null, "true", { allowed: true }])("rejects non-boolean-true admin result %s", async (data) => {
  mocks.rpc.mockResolvedValue({ data, error: null });
  expect(await requireAdmin()).toEqual({ ok: false, error: "forbidden" });
});

it("does not request account lists for an ordinary signed-in user", async () => {
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  const html = renderToStaticMarkup(await AdminPage({ params: Promise.resolve({ locale: "he" }) }));
  expect(html).toContain(he.adminPage.notAuthorizedTitle);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).toHaveBeenCalledWith("is_current_user_admin");
});

it("shows only aggregate usage, never scenario names, financial data or deletion controls", async () => {
  mocks.rpc.mockImplementation((name: string) => {
    if (name === "is_current_user_admin") return Promise.resolve({ data: true, error: null });
    if (name === "admin_list_users") return query([{ id: "synthetic-owner", email: "owner@example.test", created_at: "2026-01-01T00:00:00Z", last_sign_in_at: "2026-10-08T00:00:00Z" }]);
    // Extra unexpected fields must never propagate to the rendered overview.
    return query([{ user_id: "synthetic-owner", updated_at: "2026-10-07T00:00:00Z", name: "PRIVATE_SCENARIO_NAME", input_payload: { private: "SECRET_AMOUNT" } }]);
  });
  const html = renderToStaticMarkup(await AdminPage({ params: Promise.resolve({ locale: "he" }) }));
  expect(mocks.select.mock.calls.map(([columns]) => columns)).toEqual(["id,email,created_at,last_sign_in_at", "user_id,updated_at"]);
  expect(html).toContain(overviewLabels.he.title);
  expect(html).toContain("owner@example.test");
  expect(html).toContain(overviewLabels.he.activityHelp);
  expect(html).not.toContain(he.adminPage.scenariosSectionTitle);
  expect(html).not.toContain("PRIVATE_SCENARIO_NAME");
  expect(html).not.toContain("SECRET_AMOUNT");
  expect(html).not.toContain("<button");
});

it("does not describe a database failure as zero users or zero saved scenarios", async () => {
  mocks.rpc.mockImplementation((name: string) => name === "is_current_user_admin" ? Promise.resolve({ data: true, error: null }) : query([], { code: "SYNTHETIC_ERROR" }));
  const logging = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const html = renderToStaticMarkup(await AdminPage({ params: Promise.resolve({ locale: "he" }) }));
    expect(html).toContain(overviewLabels.he.loadError);
    expect(html).not.toContain(overviewLabels.he.noResults);
    expect(html).not.toContain("SYNTHETIC_ERROR");
  } finally { logging.mockRestore(); }
});
