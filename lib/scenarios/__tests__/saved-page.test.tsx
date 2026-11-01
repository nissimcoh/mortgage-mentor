import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import he from "../../../app/[locale]/dictionaries/he.json";
import SavedPage from "../../../app/[locale]/saved/page";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), query: { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, from: () => mocks.query }) }));
vi.mock("@/app/[locale]/dictionaries", () => ({ getDictionary: async () => he }));
vi.mock("@/components/ScenarioCard", () => ({ default: ({ name }: { name: string }) => <article>{name}</article> }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); }, notFound: () => { throw new Error("not-found"); } }));

const rows = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `row-${i}`, name: `Synthetic ${i}`, result_snapshot: null, updated_at: "2026-10-06T12:00:00Z" }));
const render = async (page?: string) => renderToStaticMarkup(await SavedPage({ params: Promise.resolve({ locale: "he" }), searchParams: Promise.resolve({ page }) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "authenticated-owner" } } });
  for (const step of ["select", "eq", "order"] as const) mocks.query[step].mockReturnValue(mocks.query);
  mocks.query.range.mockResolvedValue({ data: rows(24), error: null, count: 50 });
});

it("reads one page of the caller's scenarios with an exact total", async () => {
  const html = await render("2");
  expect(mocks.query.eq).toHaveBeenCalledWith("user_id", "authenticated-owner");
  expect(mocks.query.select).toHaveBeenCalledWith(expect.any(String), { count: "exact" });
  expect(mocks.query.range).toHaveBeenCalledWith(24, 47);
  expect(html).toContain(he.savedPage.pageStatus.replace("{page}", "2").replace("{pages}", "3"));
  expect(html).toContain('href="/he/saved"');
  expect(html).toContain('href="/he/saved?page=3"');
  expect(html).toContain(he.savedComparison.open);
});

it("treats malformed page values as the first page and omits the pager for one page", async () => {
  mocks.query.range.mockResolvedValue({ data: rows(3), error: null, count: 3 });
  const html = await render("-4");
  expect(mocks.query.range).toHaveBeenCalledWith(0, 23);
  expect(html).not.toContain(he.savedPage.olderPage);
});

it("redirects a page past the end to the last page", async () => {
  mocks.query.range.mockResolvedValue({ data: [], error: null, count: 30 });
  await expect(render("9")).rejects.toThrow("redirect:/he/saved?page=2");
});
