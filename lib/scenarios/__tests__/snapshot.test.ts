import { describe, expect, it } from "vitest";
import { createFallbackForecastCurve } from "../../market-data/mortgage-forecast-fallback";
import { calculateScenarioSummary } from "../../mortgage/calculations";
import {
  createTrackDraft,
  parseAllTrackDrafts,
  type MarketContextForParsing,
  type TrackDraft,
} from "../../mortgage/scenario-form";
import { combinedStabilityScore, stabilityKeyForTrackType } from "../../mortgage/stability";
import { SCENARIO_SCHEMA_VERSION } from "../contract";
import { buildMarketReferences, buildResultSnapshot } from "../snapshot";

const CURVE = createFallbackForecastCurve("2026-07-12T00:00:00Z");
const MARKET: MarketContextForParsing = {
  boiRatePercent: 3.5,
  curves: [CURVE],
  makamSnapshots: [{ id: "2026-06", anchorPercent: 3.2644 }],
};
const MARKET_DATA = {
  boiRatePercent: MARKET.boiRatePercent,
  boiRateEffectiveDate: "2026-01-01",
};

function fixedDraft(overrides?: Partial<TrackDraft>): TrackDraft {
  return createTrackDraft({
    amount: "800,000",
    ratePercent: "4.8",
    years: "25",
    ...overrides,
  });
}

function primeDraft(overrides?: Partial<TrackDraft>): TrackDraft {
  return createTrackDraft({
    trackType: "prime",
    amount: "500,000",
    years: "25",
    currentRatePercent: "4.5",
    ...overrides,
  });
}

function makamDraft(overrides?: Partial<TrackDraft>): TrackDraft {
  return createTrackDraft({
    trackType: "variableMakam",
    amount: "150,000",
    years: "12",
    currentRatePercent: "4.1",
    ...overrides,
  });
}

describe("buildResultSnapshot", () => {
  it("mirrors the calculator's own results header for a single fixedUnlinked track", () => {
    const drafts = [fixedDraft()];
    const inputs = parseAllTrackDrafts(drafts, MARKET)!;
    const summary = calculateScenarioSummary({ tracks: inputs });

    const snapshot = buildResultSnapshot(inputs, summary);

    expect(snapshot.schemaVersion).toBe(SCENARIO_SCHEMA_VERSION);
    expect(snapshot.totalPrincipal).toBe(800_000);
    expect(snapshot.firstPayment).toBe(summary.currentCombinedFirstPayment);
    expect(snapshot.highestPayment).toBe(summary.maximumPayment);
    expect(snapshot.highestPaymentMonth).toBe(summary.monthOfMaximumPayment);
    expect(snapshot.forecastTotalPaid).toBe(summary.totalPayment);
    expect(snapshot.totalInterestOrFinancingCost).toBe(summary.totalInterest);
    expect(snapshot.trackCount).toBe(1);
    // A lone fixedUnlinked track is the archetype's max score.
    expect(snapshot.stabilityScore).toBe(100);
  });

  it("sums principal and weights stability across multiple tracks, matching combinedStabilityScore directly", () => {
    const drafts = [fixedDraft(), primeDraft()];
    const inputs = parseAllTrackDrafts(drafts, MARKET)!;
    const summary = calculateScenarioSummary({ tracks: inputs });

    const snapshot = buildResultSnapshot(inputs, summary);

    expect(snapshot.totalPrincipal).toBe(800_000 + 500_000);
    expect(snapshot.trackCount).toBe(2);
    expect(snapshot.stabilityScore).toBe(
      combinedStabilityScore(
        inputs.map((input) => ({
          trackType: stabilityKeyForTrackType(input.type),
          loanAmount: input.loanAmount,
        })),
      ),
    );
  });
});

describe("buildMarketReferences", () => {
  it("records null curve/Makam references for a fixed-rate track", () => {
    const drafts = [fixedDraft()];
    const inputs = parseAllTrackDrafts(drafts, MARKET)!;

    const refs = buildMarketReferences(drafts, inputs, MARKET_DATA);

    expect(refs.schemaVersion).toBe(SCENARIO_SCHEMA_VERSION);
    expect(refs.boiRatePercent).toBe(MARKET.boiRatePercent);
    expect(refs.boiRateEffectiveDate).toBe("2026-01-01");
    expect(refs.tracks).toEqual([
      { trackId: drafts[0].id, forecastCurveId: null, makamSnapshotId: null },
    ]);
  });

  it("records the resolved curve ID for a prime track, with no Makam snapshot", () => {
    const drafts = [primeDraft()];
    const inputs = parseAllTrackDrafts(drafts, MARKET)!;

    const refs = buildMarketReferences(drafts, inputs, MARKET_DATA);

    expect(refs.tracks).toEqual([
      { trackId: drafts[0].id, forecastCurveId: CURVE.id, makamSnapshotId: null },
    ]);
  });

  it("records both the curve and the Makam snapshot ID for a Makam track", () => {
    const drafts = [makamDraft()];
    const inputs = parseAllTrackDrafts(drafts, MARKET)!;

    const refs = buildMarketReferences(drafts, inputs, MARKET_DATA);

    expect(refs.tracks).toEqual([
      {
        trackId: drafts[0].id,
        forecastCurveId: CURVE.id,
        makamSnapshotId: "2026-06",
      },
    ]);
  });

  it("correlates each market reference to its input_payload track by trackId, in order", () => {
    const drafts = [fixedDraft(), primeDraft(), makamDraft()];
    const inputs = parseAllTrackDrafts(drafts, MARKET)!;

    const refs = buildMarketReferences(drafts, inputs, MARKET_DATA);

    expect(refs.tracks.map((track) => track.trackId)).toEqual(
      drafts.map((draft) => draft.id),
    );
  });
});
