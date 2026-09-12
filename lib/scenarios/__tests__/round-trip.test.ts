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

describe("edit-context navigation key coexists with track params (saved scenario detail -> calculator edit mode)", () => {
  // savedScenarioId is only a lookup key now — the detail page no longer
  // writes savedScenarioUpdatedAt/savedScenarioName into the URL at all;
  // the calculator re-derives the trusted name/updatedAt itself via a
  // server-side, RLS-scoped read (lib/scenarios/edit-context.ts /
  // calculator/page.tsx's resolveEditContext).
  const SAVED_SCENARIO_ID = "123e4567-e89b-12d3-a456-426614174000";

  it("the detail page's edit link carries savedScenarioId without colliding with track params", () => {
    const payload = validateInputPayload(
      throughJson({
        schemaVersion: SCENARIO_SCHEMA_VERSION,
        tracks: [TRACK_TYPE_DRAFTS.fixedUnlinked()],
      }),
    )!;

    // Mirrors app/[locale]/saved/[scenarioId]/page.tsx's editHref build.
    const query = applyTracksToQuery(new URLSearchParams(), payload.tracks);
    query.set("savedScenarioId", SAVED_SCENARIO_ID);

    // The calculator's own parser only reads track-prefixed keys — the
    // lookup key must never be mistaken for track data.
    const reconstructedDrafts = parseTracksFromQuery(query);
    expect(reconstructedDrafts).toHaveLength(1);
    expect(reconstructedDrafts![0].trackType).toBe("fixedUnlinked");

    expect(query.get("savedScenarioId")).toBe(SAVED_SCENARIO_ID);
    expect(query.get("savedScenarioUpdatedAt")).toBeNull();
    expect(query.get("savedScenarioName")).toBeNull();
  });

  it("a recalculation (syncQuery-style full querystring copy + applyTracksToQuery) preserves the lookup key untouched", () => {
    const payload = validateInputPayload(
      throughJson({
        schemaVersion: SCENARIO_SCHEMA_VERSION,
        tracks: [TRACK_TYPE_DRAFTS.fixedUnlinked()],
      }),
    )!;
    const initialQuery = applyTracksToQuery(
      new URLSearchParams(),
      payload.tracks,
    );
    initialQuery.set("savedScenarioId", SAVED_SCENARIO_ID);

    // Mirrors MortgageCalculator's syncQuery: start from the FULL existing
    // query string (new URLSearchParams(searchParams.toString())), then
    // let applyTracksToQuery touch only the track-prefixed keys.
    const editedDraft = createTrackDraft({
      amount: "900,000",
      ratePercent: "5.0",
      years: "20",
    });
    const nextQuery = new URLSearchParams(initialQuery.toString());
    applyTracksToQuery(nextQuery, [editedDraft]);

    expect(nextQuery.get("track1Amount")).toBe("900000");
    expect(nextQuery.get("savedScenarioId")).toBe(SAVED_SCENARIO_ID);
  });

  it("exiting edit mode deletes savedScenarioId (and any legacy name/updatedAt from an old bookmarked link) leaving track params untouched", () => {
    const payload = validateInputPayload(
      throughJson({
        schemaVersion: SCENARIO_SCHEMA_VERSION,
        tracks: [TRACK_TYPE_DRAFTS.fixedUnlinked()],
      }),
    )!;
    const query = applyTracksToQuery(new URLSearchParams(), payload.tracks);
    query.set("savedScenarioId", SAVED_SCENARIO_ID);
    // Simulates a stale bookmark from before this hardening pass, which
    // may still carry the old (now-ignored) params.
    query.set("savedScenarioUpdatedAt", "2026-07-01T12:00:00.000Z");
    query.set("savedScenarioName", "My mortgage");

    // Mirrors MortgageCalculator's exitEditMode.
    query.delete("savedScenarioId");
    query.delete("savedScenarioUpdatedAt");
    query.delete("savedScenarioName");

    expect(query.get("savedScenarioId")).toBeNull();
    expect(query.get("savedScenarioUpdatedAt")).toBeNull();
    expect(query.get("savedScenarioName")).toBeNull();
    expect(query.get("track1Type")).toBe("fixedUnlinked");
    expect(query.get("track1Amount")).toBe("800000");
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
