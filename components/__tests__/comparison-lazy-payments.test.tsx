// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SavedScenarioComparison from "../SavedScenarioComparison";
import he from "@/app/[locale]/dictionaries/he.json";
import type { ComparisonScenario } from "@/lib/scenarios/comparison";
import { mount, unmount } from "./dom-helpers";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
vi.mock("@/lib/scenarios/comparison-actions", () => ({ loadComparisonPayments: mocks.load }));

const scenario = (n: number, payments: number[] | null | undefined): ComparisonScenario => ({
  id: `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${String(n).repeat(12)}`,
  name: `Synthetic ${n}`, calculatedAt: "2026-10-06T12:00:00Z",
  result: { schemaVersion: 1, totalPrincipal: 180000, firstPayment: 1200, highestPayment: 1600, highestPaymentMonth: 180, forecastTotalPaid: 216000, totalInterestOrFinancingCost: 36000, stabilityScore: 50, trackCount: 1 },
  years: 15, rateExposure: 1, cpiExposure: 0, fixedShare: 0, forecastSignature: "synthetic", customForecast: false, payments,
});

beforeEach(() => mocks.load.mockReset());
afterEach(unmount);

it("requests a series only for a newly selected mix, once, and shows the charts after it arrives", async () => {
  const third = scenario(3, undefined);
  let resolve!: (value: Record<string, number[]>) => void;
  mocks.load.mockReturnValue(new Promise(done => { resolve = done; }));
  await mount(<SavedScenarioComparison scenarios={[scenario(1, Array(180).fill(1200)), scenario(2, Array(180).fill(1200)), third]} locale="he" labels={he.savedComparison} />);
  expect(mocks.load).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain(he.savedComparison.monthlyChartTitle);

  const select = document.querySelectorAll("select")[1] as HTMLSelectElement;
  await act(async () => {
    select.value = third.id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(mocks.load).toHaveBeenCalledExactlyOnceWith([third.id]);
  expect(document.body.textContent).toContain(he.savedComparison.chartsLoading);
  expect(document.body.textContent).not.toContain(he.savedComparison.monthlyChartTitle);

  await act(async () => resolve({ [third.id]: Array(180).fill(1200) }));
  expect(document.body.textContent).not.toContain(he.savedComparison.chartsLoading);
  expect(document.body.textContent).toContain(he.savedComparison.monthlyChartTitle);
  expect(document.body.textContent).not.toContain(he.savedComparison.chartUnavailable);
  expect(mocks.load).toHaveBeenCalledTimes(1);
});

it("treats a failed request as an unavailable chart instead of loading forever", async () => {
  // The action answers null when the session, IDs or query fail.
  mocks.load.mockResolvedValue(null);
  await mount(<SavedScenarioComparison scenarios={[scenario(1, Array(180).fill(1200)), scenario(2, undefined)]} locale="he" labels={he.savedComparison} />);
  await act(async () => { await new Promise(done => setTimeout(done, 0)); });
  expect(document.body.textContent).not.toContain(he.savedComparison.chartsLoading);
  expect(document.body.textContent).toContain(he.savedComparison.chartUnavailable);
});
