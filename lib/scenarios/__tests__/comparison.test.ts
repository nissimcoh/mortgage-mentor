import { describe, expect, it } from "vitest";
import { createTrackDraft } from "../../mortgage/scenario-form";
import { comparisonWarnings, resolveComparisonSelection, toComparisonScenario, type ComparisonRow } from "../comparison";

function row(): ComparisonRow {
  return {
    id: "11111111-1111-4111-8111-111111111111", name: "Synthetic comparison", calculated_at: "2026-10-06T12:00:00Z",
    input_payload: { schemaVersion: 1, tracks: [
      createTrackDraft({ amount: "100000", years: "15", ratePercent: "3" }),
      { ...createTrackDraft({ trackType: "variableLinked", amount: "300000", years: "20", currentRatePercent: "3", resetPeriodMonths: "60", forecastMode: "official" }), id: "linked-track" },
    ] },
    result_snapshot: { schemaVersion: 1, totalPrincipal: 400000, firstPayment: 2100, highestPayment: 3100, highestPaymentMonth: 240, forecastTotalPaid: 650000, totalInterestOrFinancingCost: 250000, stabilityScore: 60, trackCount: 2 },
    market_references: { schemaVersion: 1, boiRatePercent: 3, boiRateEffectiveDate: "2026-01-01", tracks: [{ trackId: "linked-track", forecastCurveId: "synthetic-curve", makamSnapshotId: null }] },
  };
}

describe("saved scenario comparison", () => {
  it("weights exposure by principal and counts variable-linked in both exposures", () => {
    const actual = toComparisonScenario(row())!;
    expect(actual.rateExposure).toBe(.75);
    expect(actual.cpiExposure).toBe(.75);
    expect(actual.fixedShare).toBe(.25);
    expect(actual.years).toBe(20);
    expect(actual.result.forecastTotalPaid).toBe(650000);
    expect(actual.forecastSignature).toBe("synthetic-curve");
    expect(actual).not.toHaveProperty("input_payload");
  });

  it("rejects invalid inputs, incomplete snapshots and mismatched saved amounts", () => {
    expect(toComparisonScenario({ ...row(), input_payload: null })).toBeNull();
    expect(toComparisonScenario({ ...row(), result_snapshot: { totalPrincipal: 400000 } })).toBeNull();
    expect(toComparisonScenario({ ...row(), id: "not-a-uuid" })).toBeNull();
    const invalid = row();
    invalid.input_payload = { schemaVersion: 1, tracks: [createTrackDraft({ amount: "not-money", years: "15", ratePercent: "3" })] };
    expect(toComparisonScenario(invalid)).toBeNull();
    const mismatch = row();
    mismatch.result_snapshot = { ...(mismatch.result_snapshot as object), totalPrincipal: 410000 };
    expect(toComparisonScenario(mismatch)).toBeNull();
  });

  it("warns about missing/different forecasts, custom modes and different terms", () => {
    const first = toComparisonScenario(row())!;
    expect(comparisonWarnings([first, first])).toEqual({ differentTerms: false, differentForecasts: false, customForecast: false });
    const missing = toComparisonScenario({ ...row(), market_references: null })!;
    expect(comparisonWarnings([first, missing]).differentForecasts).toBe(true);
    expect(comparisonWarnings([first, { ...first, forecastSignature: "another-curve" }]).differentForecasts).toBe(true);
    expect(comparisonWarnings([first, { ...first, years: 25, customForecast: true }])).toEqual({ differentTerms: true, differentForecasts: false, customForecast: true });
    expect(comparisonWarnings([{ ...first, forecastSignature: null }, { ...first, forecastSignature: null }]).differentForecasts).toBe(false);
  });

  it("does not turn missing references into a claim of matching forecast data", () => {
    const missingTrack = row();
    missingTrack.market_references = { schemaVersion: 1, boiRatePercent: 3, boiRateEffectiveDate: "2026-01-01", tracks: [] };
    expect(toComparisonScenario(missingTrack)?.forecastSignature).toBe("unknown");
  });

  it("resolves unique selections only from the owned list, preserving baseline order", () => {
    const first = toComparisonScenario(row())!;
    const second = { ...first, id: "22222222-2222-4222-8222-222222222222" };
    expect(resolveComparisonSelection([first, second], [second.id, first.id, first.id, "other-user-id"]).map(item => item.id)).toEqual([second.id, first.id]);
    expect(resolveComparisonSelection([first], ["other-user-id"])).toEqual([]);
  });
});
