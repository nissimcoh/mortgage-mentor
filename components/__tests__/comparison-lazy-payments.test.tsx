// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SavedScenarioComparison from "../SavedScenarioComparison";
import RefinanceComparison from "../RefinanceComparison";
import { simulateExistingMortgage } from "@/lib/payoff-report/simulate";
import { formatMoney } from "@/lib/payoff-report/present";
import he from "@/app/[locale]/dictionaries/he.json";
import type { ComparisonScenario } from "@/lib/scenarios/comparison";
import { button, click, mount, type, unmount } from "./dom-helpers";

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

it("includes funded fees in repayments and adds only this mix's upfront costs", async () => {
  const a = scenario(1, null);
  const b = scenario(2, null);
  b.result.totalPrincipal -= 5000;
  mocks.load.mockResolvedValue(null);
  const labels = he.payoffPage;
  const simulation = simulateExistingMortgage([], {
    boiRatePercent: 3, nominalZeroYieldsPercent: [], realZeroYieldsPercent: [], expectedCpiIndex: [],
  });
  await mount(<RefinanceComparison locale="he" loans={[]} simulation={simulation} balanceToSettle={180000.25}
    fees={1662.72} mixes={[a, b]} labels={labels} comparisonLabels={he.savedComparison} />);
  const amount = () => document.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!;
  const value = (label: string) => [...document.querySelectorAll("tbody tr")]
    .find(row => row.querySelector("th")?.textContent === label)?.lastElementChild?.textContent;
  expect(value(labels.compareRowFinancedFees)).toBe(formatMoney(1662.72, "he"));
  expect(value(labels.compareRowTotalWithFees)).toBe(formatMoney(216000, "he"));
  await type(amount(), "360");
  expect(value(labels.compareRowTotalWithFees)).toBe(formatMoney(216360, "he"));
  await click(button(b.name));
  expect(amount().value).toBe("");
  expect(document.body.textContent).toContain(labels.comparePrincipalMismatch.split("{mix}")[0]);
  expect(document.body.textContent).not.toContain(labels.compareExtra.split("{amount}")[0]);
  await click(button(a.name));
  expect(amount().value).toBe("360");
  await type(amount(), "-5");
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(labels.compareCostInvalid);
  expect(value(labels.compareRowTotalWithFees)).toBeUndefined();
});

it("reuses an in-flight refinance series when switching back and handles a failed read", async () => {
  const a = scenario(1, undefined), b = scenario(2, undefined);
  let resolveA!: (series: Record<string, number[]>) => void;
  mocks.load.mockReturnValueOnce(new Promise(done => { resolveA = done; }))
    .mockRejectedValueOnce(new Error("offline"));
  const simulation = simulateExistingMortgage([], {
    boiRatePercent: 3, nominalZeroYieldsPercent: [], realZeroYieldsPercent: [], expectedCpiIndex: [],
  });
  await mount(<RefinanceComparison locale="he" loans={[]} simulation={simulation} balanceToSettle={180000}
    fees={0} mixes={[a, b]} labels={he.payoffPage} comparisonLabels={he.savedComparison} />);
  await click(button(b.name));
  expect(document.body.textContent).toContain(he.savedComparison.chartUnavailable);
  await click(button(a.name));
  expect(document.body.textContent).toContain(he.savedComparison.chartsLoading);
  await act(async () => resolveA({ [a.id]: Array(180).fill(1200) }));
  expect(document.body.textContent).toContain(he.savedComparison.monthlyChartTitle);
  expect(mocks.load.mock.calls).toEqual([[[a.id]], [[b.id]]]);
});

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
