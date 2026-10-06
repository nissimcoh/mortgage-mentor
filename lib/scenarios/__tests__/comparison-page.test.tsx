import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import he from "../../../app/[locale]/dictionaries/he.json";
import ComparePage from "../../../app/[locale]/compare/page";
import SavedScenarioComparison from "../../../components/SavedScenarioComparison";
import type { ComparisonScenario } from "../comparison";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }) }));
vi.mock("@/app/[locale]/dictionaries", () => ({ getDictionary: async () => he }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); }, notFound: () => { throw new Error("not-found"); } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "authenticated-owner" } } });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ order: mocks.order });
  mocks.order.mockResolvedValue({ data: [], error: null });
});

it("redirects unauthenticated visitors back through sign-in without reading rows", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  await expect(ComparePage({ params: Promise.resolve({ locale: "he" }) })).rejects.toThrow("redirect:/he/signin?next=%2Fhe%2Fcompare");
  expect(mocks.from).not.toHaveBeenCalled();
});

it("scopes the saved comparison query to the authenticated owner and handles empty lists", async () => {
  const html = renderToStaticMarkup(await ComparePage({ params: Promise.resolve({ locale: "he" }) }));
  expect(mocks.eq).toHaveBeenCalledWith("user_id", "authenticated-owner");
  expect(mocks.from).toHaveBeenCalledWith("mortgage_scenarios");
  expect(html).toContain(he.savedComparison.emptyTitle);
});

it("shows a safe database error instead of treating it as an empty list", async () => {
  mocks.order.mockResolvedValue({ data: null, error: { message: "internal database detail" } });
  const html = renderToStaticMarkup(await ComparePage({ params: Promise.resolve({ locale: "he" }) }));
  expect(html).toContain(he.savedComparison.loadError);
  expect(html).not.toContain(he.savedComparison.emptyTitle);
  expect(html).not.toContain("internal database detail");
});

it("renders two saved snapshots with differences, exposures and distinct selections", () => {
  const base: ComparisonScenario = {
    id: "11111111-1111-4111-8111-111111111111", name: "Synthetic A", calculatedAt: "2026-10-06T12:00:00Z",
    result: { schemaVersion: 1, totalPrincipal: 180000, firstPayment: 1200, highestPayment: 1600, highestPaymentMonth: 180, forecastTotalPaid: 240000, totalInterestOrFinancingCost: 60000, stabilityScore: 50, trackCount: 1 },
    years: 15, rateExposure: 1, cpiExposure: 0, fixedShare: 0, forecastSignature: "synthetic", customForecast: false,
  };
  const second = { ...base, id: "22222222-2222-4222-8222-222222222222", name: "Synthetic B", result: { ...base.result, forecastTotalPaid: 230000 } };
  const html = renderToStaticMarkup(<SavedScenarioComparison scenarios={[base, second]} locale="he" labels={he.savedComparison} />);
  expect(html).toContain("Synthetic A");
  expect(html).toContain("Synthetic B");
  expect(html).toContain("10,000");
  expect(html).toContain(he.savedComparison.snapshotNote);
  expect(html).toContain(he.savedComparison.rateExposure);
  expect((html.match(/disabled=""/g) ?? []).length).toBe(2);
  expect(html).not.toContain(he.savedComparison.differentForecasts);
});
