import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import he from "../../../app/[locale]/dictionaries/he.json";
import { requireAdmin } from "../guard";
import AdminPage from "../../../app/[locale]/admin/page";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }) }));
vi.mock("@/app/[locale]/dictionaries", () => ({ getDictionary: async () => he }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); }, notFound: () => { throw new Error("not-found"); } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "synthetic-owner" } } });
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "is_current_user_admin" ? true : [], error: null }));
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

it("shows the authorized read-only overview without deletion controls", async () => {
  const html = renderToStaticMarkup(await AdminPage({ params: Promise.resolve({ locale: "he" }) }));
  expect(mocks.rpc).toHaveBeenCalledWith("admin_list_users");
  expect(mocks.rpc).toHaveBeenCalledWith("admin_list_scenarios");
  expect(html).toContain(he.adminPage.usersSectionTitle);
  expect(html).toContain(he.adminPage.scenariosSectionTitle);
  expect(html).not.toContain("<button");
});

it("does not describe a database failure as zero registered users", async () => {
  mocks.rpc.mockImplementation(async (name: string) => name === "is_current_user_admin" ? { data: true, error: null } : { data: null, error: { code: "SYNTHETIC_ERROR" } });
  const logging = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const html = renderToStaticMarkup(await AdminPage({ params: Promise.resolve({ locale: "he" }) }));
    expect(html).toContain(he.adminPage.loadErrorMessage);
    expect(html).not.toContain(he.adminPage.emptyUsersMessage);
    expect(html).not.toContain("SYNTHETIC_ERROR");
  } finally { logging.mockRestore(); }
});
