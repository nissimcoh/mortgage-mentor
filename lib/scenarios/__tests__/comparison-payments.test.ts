import { describe, expect, it, vi } from "vitest";
import { createFallbackForecastCurve } from "../../market-data/mortgage-forecast-fallback";
import { calculateScenarioSummary } from "../../mortgage/calculations";
import { CALCULATOR_VERSION } from "../../mortgage/calculator-version";
import { createTrackDraft, parseAllTrackDrafts, type TrackDraft } from "../../mortgage/scenario-form";
import { buildMarketReferences, buildResultSnapshot } from "../snapshot";
import type { ComparisonRow } from "../comparison";
import { reconstructComparisonPayments } from "../comparison-payments";
import { comparisonMonthValues, cumulativePayments } from "../comparison-chart-data";
import { loadComparisonScenarios } from "../load-comparison";

const mocks = vi.hoisted(() => ({ forecasts: vi.fn(), makam: vi.fn() }));
vi.mock("../../market-data/sources/boi-mortgage-forecast", () => ({ getMortgageForecastData: mocks.forecasts }));
vi.mock("../../market-data/sources/boi-makam", () => ({ getMakamAnchorData: mocks.makam }));

const curve = createFallbackForecastCurve("2026-07-12T00:00:00Z");
const market = { boiRatePercent: 3.5, curves: [curve], makamSnapshots: [{ id: "2026-06", anchorPercent: 3.2644 }] };

function saved(tracks: TrackDraft[]) {
  const inputs = parseAllTrackDrafts(tracks, market)!;
  const summary = calculateScenarioSummary({ tracks: inputs });
  const row: ComparisonRow = {
    id: "11111111-1111-4111-8111-111111111111", name: "Synthetic historical mix", calculated_at: "2026-07-12T00:00:00Z", calculator_version: CALCULATOR_VERSION,
    input_payload: { schemaVersion: 1, tracks }, result_snapshot: buildResultSnapshot(inputs, summary),
    market_references: buildMarketReferences(tracks, inputs, { boiRatePercent: 3.5, boiRateEffectiveDate: "2026-01-01" }),
  };
  return { row, summary };
}

function draft(trackType = "fixedUnlinked", overrides: Partial<TrackDraft> = {}) {
  return createTrackDraft({ trackType, amount: "300000", years: "20", ratePercent: "4", currentRatePercent: "4", resetPeriodMonths: "60", forecastMode: "official", ...overrides });
}

describe("historical comparison payments", () => {
  it("reproduces fixed tracks without market references and includes drops when shorter tracks finish", () => {
    const { row, summary } = saved([draft(), { ...draft("fixedUnlinked", { years: "10", repaymentMethod: "equalPrincipal" }), id: "short-track" }]);
    row.market_references = null;
    const payments = reconstructComparisonPayments(row, { curves: [] })!;
    expect(payments).toEqual(summary.combinedSchedule.map(entry => entry.payment));
    expect(payments).toHaveLength(240);
    expect(payments[120]).toBeLessThan(payments[119]);
    expect(cumulativePayments(payments).at(-1)).toBe(summary.totalPayment);
  });

  it.each(["prime", "variableGovernmentBond", "variableMakam", "fixedLinked", "variableLinked"])("reproduces %s using the saved reference even when the draft has no pin", trackType => {
    const { row, summary } = saved([draft(trackType)]);
    const newer = { ...curve, id: "newer-calendar", nominalZeroYieldsPercent: Array(360).fill(9) };
    expect(reconstructComparisonPayments(row, { ...market, curves: [newer, curve] })).toEqual(summary.combinedSchedule.map(entry => entry.payment));
  });

  it.each(["constant", "stress"])("preserves %s rate and CPI assumptions", forecastMode => {
    const { row, summary } = saved([draft("variableLinked", { forecastMode, stressShift: "2", inflationStressShift: "1" })]);
    expect(reconstructComparisonPayments(row, market)).toEqual(summary.combinedSchedule.map(entry => entry.payment));
  });

  it("uses the saved BOI rate, and distinguishes today's first payment from forecast month one", () => {
    const { row, summary } = saved([draft("prime")]);
    expect(summary.currentCombinedFirstPayment).not.toBe(summary.forecastCombinedFirstPayment);
    const payments = reconstructComparisonPayments(row, market)!;
    expect(payments[0]).toBe(summary.forecastCombinedFirstPayment);
    row.market_references = { ...(row.market_references as object), boiRatePercent: 8 };
    expect(reconstructComparisonPayments(row, market)).toBeNull();
  });

  it("refuses missing curve, Makam anchor and malformed/duplicate saved references", () => {
    const { row } = saved([draft("variableMakam")]);
    expect(reconstructComparisonPayments(row, { curves: [] })).toBeNull();
    expect(reconstructComparisonPayments(row, { curves: [curve], makamSnapshots: [] })).toBeNull();
    expect(reconstructComparisonPayments({ ...row, market_references: null }, market)).toBeNull();
    const refs = row.market_references as { tracks: object[] };
    expect(reconstructComparisonPayments({ ...row, market_references: { ...refs, tracks: [...refs.tracks, ...refs.tracks] } }, market)).toBeNull();
  });

  it("does not display a revised curve or a schedule that disagrees with any saved payment metric", () => {
    const { row } = saved([draft("prime")]);
    expect(reconstructComparisonPayments({ ...row, calculator_version: "previous-methodology" }, market)).toBeNull();
    expect(reconstructComparisonPayments(row, { ...market, curves: [{ ...curve, nominalZeroYieldsPercent: Array(360).fill(9) }] })).toBeNull();
    for (const field of ["firstPayment", "highestPayment", "highestPaymentMonth", "forecastTotalPaid", "totalInterestOrFinancingCost"]) {
      const snapshot = row.result_snapshot as Record<string, number>;
      expect(reconstructComparisonPayments({ ...row, result_snapshot: { ...snapshot, [field]: snapshot[field] + (field === "highestPaymentMonth" ? 1 : 0.01) } }, market)).toBeNull();
    }
  });

  it("sums in agorot, starts cumulative at zero and holds completed mixes flat", () => {
    const payments = [10.1, 20.2, 30.3];
    const cumulative = cumulativePayments(payments);
    expect(cumulative).toEqual([0, 10.1, 30.3, 60.6]);
    expect(comparisonMonthValues(payments, cumulative, 1)).toEqual({ payment: 10.1, cumulative: 10.1 });
    expect(comparisonMonthValues(payments, cumulative, 3)).toEqual({ payment: 30.3, cumulative: 60.6 });
    expect(comparisonMonthValues(payments, cumulative, 240)).toEqual({ payment: 0, cumulative: 60.6 });
  });

  it("batches saved market IDs without fetching the current BOI rate or sending curves to the client", async () => {
    vi.clearAllMocks();
    mocks.forecasts.mockResolvedValue({ curves: [curve] });
    mocks.makam.mockResolvedValue({ snapshots: market.makamSnapshots });
    const { row } = saved([draft("variableMakam")]);
    const scenarios = await loadComparisonScenarios([row, { ...row, id: "22222222-2222-4222-8222-222222222222" }]);
    expect(mocks.forecasts).toHaveBeenCalledExactlyOnceWith([curve.id]);
    expect(mocks.makam).toHaveBeenCalledExactlyOnceWith(["2026-06"]);
    expect(scenarios[0].payments).toHaveLength(240);
    expect(scenarios[0]).not.toHaveProperty("curves");
    expect(scenarios[0]).not.toHaveProperty("input_payload");
  });

  it("skips fetching for fixed-only/empty lists and preserves the table when sources fail", async () => {
    vi.clearAllMocks();
    const { row } = saved([draft()]);
    expect((await loadComparisonScenarios([row]))[0].payments).toHaveLength(240);
    expect(await loadComparisonScenarios([])).toEqual([]);
    expect(mocks.forecasts).not.toHaveBeenCalled();
    expect(mocks.makam).not.toHaveBeenCalled();
    mocks.forecasts.mockRejectedValue(new Error("private source detail"));
    const prime = saved([draft("prime")]).row;
    const [scenario] = await loadComparisonScenarios([prime]);
    expect(scenario.result).toEqual(prime.result_snapshot);
    expect(scenario.payments).toBeNull();
    expect(JSON.stringify(scenario)).not.toContain("private source detail");
  });
});
