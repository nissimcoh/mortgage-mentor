import { describe, expect, it } from "vitest";
import { createFallbackForecastCurve } from "../../market-data/mortgage-forecast-fallback";
import {
  applyTracksToQuery,
  createTrackDraft,
  parseAllTrackDrafts,
  parseTracksFromQuery,
  type MarketContextForParsing,
  type TrackDraft,
} from "../../mortgage/scenario-form";
import { SCENARIO_SCHEMA_VERSION } from "../contract";
import { validateInputPayload } from "../payload";

const CURVE = createFallbackForecastCurve("2026-07-12T00:00:00Z");
const MARKET: MarketContextForParsing = {
  boiRatePercent: 3.5,
  curves: [CURVE],
  makamSnapshots: [{ id: "2026-06", anchorPercent: 3.2644 }],
};

/** One draft per implemented engine track type (MortgageTrackInput's
 * five concrete members — not the TrackType stubs that aren't wired up
 * yet), matching the fixtures already established in scenario-form.test.ts. */
const TRACK_TYPE_DRAFTS: Record<string, () => TrackDraft> = {
  fixedUnlinked: () =>
    createTrackDraft({ amount: "800,000", ratePercent: "4.8", years: "25" }),
  prime: () =>
    createTrackDraft({
      trackType: "prime",
      amount: "500,000",
      years: "25",
      currentRatePercent: "4.5",
      forecastCurveId: CURVE.id,
    }),
  variableGovernmentBond: () =>
    createTrackDraft({
      trackType: "variableGovernmentBond",
      amount: "200,000",
      years: "20",
      currentRatePercent: "4",
      resetPeriodMonths: "24",
      forecastCurveId: CURVE.id,
    }),
  variableMakam: () =>
    createTrackDraft({
      trackType: "variableMakam",
      amount: "150,000",
      years: "12",
      currentRatePercent: "4.1",
      forecastCurveId: CURVE.id,
      makamSnapshotId: "2026-06",
    }),
  fixedLinked: () =>
    createTrackDraft({
      trackType: "fixedLinked",
      amount: "500,000",
      years: "20",
      currentRatePercent: "4.5",
      forecastCurveId: CURVE.id,
    }),
};

/** Simulates the actual JSONB round trip through Postgres: a real JSON
 * serialize/deserialize, not just an object copy. */
function throughJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe("save -> open round trip, one per implemented track type", () => {
  for (const [trackType, makeDraft] of Object.entries(TRACK_TYPE_DRAFTS)) {
    it(`${trackType}: input_payload survives save, JSON round trip, and reopening as calculator query params`, () => {
      const originalDraft = makeDraft();
      const originalInputs = parseAllTrackDrafts([originalDraft], MARKET);
      expect(originalInputs).not.toBeNull();

      // "Save": build the stored contract and put it through a real JSON
      // round trip (what actually happens going into/out of a jsonb column).
      const storedInputPayload = throughJson({
        schemaVersion: SCENARIO_SCHEMA_VERSION,
        tracks: [originalDraft],
      });

      // "Open": validate the stored payload defensively, exactly as the
      // /saved page does before trusting it.
      const payload = validateInputPayload(storedInputPayload);
      expect(payload).not.toBeNull();

      // Reconstruct calculator query params using the existing
      // scenario-form logic — no second calculator-loading format.
      const query = applyTracksToQuery(new URLSearchParams(), payload!.tracks);
      expect(query.get("track1Type")).toBe(trackType);

      // The calculator's own URL parser must read it back into an
      // equivalent draft, and the engine must accept it identically.
      const reconstructedDrafts = parseTracksFromQuery(query);
      expect(reconstructedDrafts).toHaveLength(1);

      const reconstructedInputs = parseAllTrackDrafts(
        reconstructedDrafts!,
        MARKET,
      );
      expect(reconstructedInputs).not.toBeNull();
      expect(reconstructedInputs).toEqual(originalInputs);
    });
  }
});

describe("opening a saved scenario reconstructs calculator query params", () => {
  it("produces the same query a shared link with these tracks would carry", () => {
    const drafts = [
      TRACK_TYPE_DRAFTS.fixedUnlinked(),
      TRACK_TYPE_DRAFTS.variableMakam(),
    ];
    const payload = validateInputPayload(
      throughJson({ schemaVersion: SCENARIO_SCHEMA_VERSION, tracks: drafts }),
    )!;

    const query = applyTracksToQuery(new URLSearchParams(), payload.tracks);

    expect(query.get("trackCount")).toBe("2");
    expect(query.get("track1Amount")).toBe("800000");
    expect(query.get("track1Type")).toBe("fixedUnlinked");
    expect(query.get("track2Type")).toBe("variableMakam");
    expect(query.get("track2MakamSnapshotId")).toBe("2026-06");
  });
});

describe("invalid stored input_payload does not crash", () => {
  it("returns null for a malformed track list instead of throwing", () => {
    expect(
      validateInputPayload(
        throughJson({ schemaVersion: 1, tracks: "not-an-array" }),
      ),
    ).toBeNull();
    expect(validateInputPayload(throughJson({ garbage: true }))).toBeNull();
    expect(validateInputPayload(null)).toBeNull();
  });
});
