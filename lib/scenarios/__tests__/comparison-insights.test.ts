import { describe, expect, it } from "vitest";
import type { ComparisonScenario } from "../comparison";
import { comparisonHighlights, cumulativeCrossoverMonth } from "../comparison-insights";

const scenario = (id: string, result: Partial<ComparisonScenario["result"]>, fixedShare = 0): ComparisonScenario => ({
  id, name: id, calculatedAt: "2026-10-06T12:00:00Z",
  result: { schemaVersion: 1, totalPrincipal: 100000, firstPayment: 1000, highestPayment: 1200, highestPaymentMonth: 1, forecastTotalPaid: 150000, totalInterestOrFinancingCost: 50000, stabilityScore: 50, trackCount: 1, ...result },
  years: 10, rateExposure: 0, cpiExposure: 0, fixedShare, forecastSignature: null, customForecast: false, payments: null,
});

describe("comparisonHighlights", () => {
  it("names the single leader of each dimension", () => {
    const a = scenario("a", { forecastTotalPaid: 140000, firstPayment: 1100, highestPayment: 1100 }, 1);
    const b = scenario("b", { forecastTotalPaid: 150000, firstPayment: 900, highestPayment: 1400 }, 0.3);
    expect(comparisonHighlights([a, b])).toEqual({ lowestTotal: "a", lowestFirst: "b", lowestPeak: "a", mostFixed: "a" });
  });

  it("awards nobody on a tie", () => {
    const a = scenario("a", {});
    const b = scenario("b", {});
    expect(comparisonHighlights([a, b])).toEqual({ lowestTotal: null, lowestFirst: null, lowestPeak: null, mostFixed: null });
  });
});

describe("cumulativeCrossoverMonth", () => {
  it("finds the month a cheaper start is overtaken", () => {
    // a pays 900 then 1,300; b pays a flat 1,000. Cumulative: a leads until month 4.
    const a = [900, 900, 900, 1300, 1300, 1300];
    const b = Array(6).fill(1000);
    expect(cumulativeCrossoverMonth(a, b)).toBe(5);
  });

  it("returns null when the lead never changes or history is missing", () => {
    expect(cumulativeCrossoverMonth([900, 900], [1000, 1000])).toBeNull();
    expect(cumulativeCrossoverMonth(null, [1000])).toBeNull();
  });
});
