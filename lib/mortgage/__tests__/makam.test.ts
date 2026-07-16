import { describe, expect, it } from "vitest";
import {
  calculateScenarioSummary,
  calculateTrackSummary,
  type VariableMakamTrackInput,
} from "../index";
import {
  parseMakamCsv,
  pickMakamSnapshotsForRequest,
} from "../../market-data/sources/boi-makam-parse";
import { createFallbackMakamSnapshot } from "../../market-data/makam-fallback";

// Synthetic curve with hand-computable annual forwards:
// A_m (percent) = 3 + m/120, so A_12 = 3.1, A_24 = 3.2, A_36 = 3.3.
const SYNTHETIC = Array.from({ length: 360 }, (_, i) => 3 + (i + 1) / 120);

const MAKAM_ANCHOR = 3.25;
const OFFERED = 4.1;
const MARGIN = OFFERED - MAKAM_ANCHOR; // 0.85 — contractual margin

const baseTrack: VariableMakamTrackInput = {
  type: "variableMakam",
  repaymentMethod: "spitzer",
  loanAmount: 400_000,
  years: 10,
  currentCustomerRatePercent: OFFERED,
  resetPeriodMonths: 12,
  currentMakamAnchorPercent: MAKAM_ANCHOR,
  forecastZeroYieldsPercent: SYNTHETIC,
  forecastMode: "official",
  forecastCurveId: "synthetic",
  makamSnapshotId: "2026-06",
};

const FORWARD_12_24 = ((1.032 ** 2 / 1.031) ** 1 - 1) * 100;
const FORWARD_24_36 = ((1.033 ** 3 / 1.032 ** 2) ** 1 - 1) * 100;

describe("Makam annual forecast path", () => {
  const summary = calculateTrackSummary(baseTrack);

  it("uses the offered rate for the entire first year", () => {
    for (let month = 1; month <= 12; month++) {
      expect(summary.schedule[month - 1].activeAnnualRatePercent).toBe(
        OFFERED,
      );
    }
  });

  it("year 2 uses the zero-curve annual forward plus the Makam margin", () => {
    // Per the Directive-451 reference table, Makam loans forecast from the
    // NOMINAL ZERO CURVE; the margin comes from the official Makam anchor.
    expect(summary.schedule[12].activeAnnualRatePercent).toBeCloseTo(
      FORWARD_12_24 + MARGIN,
      10,
    );
    for (let month = 13; month <= 24; month++) {
      expect(summary.schedule[month - 1].activeAnnualRatePercent).toBe(
        summary.schedule[12].activeAnnualRatePercent,
      );
    }
    expect(summary.schedule[24].activeAnnualRatePercent).toBeCloseTo(
      FORWARD_24_36 + MARGIN,
      10,
    );
  });

  it("exposes the Makam anchor, margin, and snapshot provenance", () => {
    expect(summary.variableForecast!.makamAnchorPercent).toBe(MAKAM_ANCHOR);
    expect(summary.variableForecast!.makamSnapshotId).toBe("2026-06");
    expect(summary.variableForecast!.customerAnchorMarginPercent).toBeCloseTo(
      MARGIN,
      10,
    );
    expect(summary.variableForecast!.resetPeriodMonths).toBe(12);
  });

  it("amortizes to exactly zero with the first payment at the offered rate", () => {
    expect(summary.finalBalance).toBe(0);
    expect(summary.numberOfPayments).toBe(120);
    expect(summary.variableForecast!.currentFirstPayment).toBe(
      summary.firstPayment,
    );
    expect(summary.schedule[0].openingBalance).toBe(400_000);
  });

  it("constant mode holds the offered rate; invalid inputs throw", () => {
    const constant = calculateTrackSummary({
      ...baseTrack,
      forecastMode: "constant",
    });
    expect(
      constant.schedule.every(
        (entry) => entry.activeAnnualRatePercent === OFFERED,
      ),
    ).toBe(true);

    expect(() =>
      calculateTrackSummary({
        ...baseTrack,
        resetPeriodMonths: 24,
      } as unknown as VariableMakamTrackInput),
    ).toThrow(/resets every 12 months/);
    expect(() =>
      calculateTrackSummary({
        ...baseTrack,
        currentMakamAnchorPercent: Number.NaN,
      }),
    ).toThrow(/currentMakamAnchorPercent/);
  });

  it("participates in combined scenarios", () => {
    const scenario = calculateScenarioSummary({
      tracks: [
        baseTrack,
        {
          type: "fixedUnlinked",
          repaymentMethod: "spitzer",
          loanAmount: 600_000,
          annualInterestRatePercent: 4.8,
          interestRateInputMode: "nominalAnnual",
          years: 20,
        },
      ],
    });
    expect(scenario.finalBalance).toBe(0);
    // Month-1 weighted rate: (400k·4.1 + 600k·4.8) / 1M.
    expect(scenario.combinedSchedule[0].activeAnnualRatePercent).toBeCloseTo(
      (400_000 * OFFERED + 600_000 * 4.8) / 1_000_000,
      10,
    );
  });
});

describe("Makam anchor source parsing", () => {
  const CSV = [
    "SERIES_CODE,FREQ,ORIGINAL_CODE,TIME_PERIOD,OBS_VALUE,RELEASE_STATUS",
    "DWH_SRC_0351_MA,M,TSB_BAGR_MAKAM_12M.M,2026-04,3.7184648561,YP",
    "DWH_SRC_0351_MA,M,TSB_BAGR_MAKAM_12M.M,2026-05,3.6296665626,YP",
    "DWH_SRC_0351_MA,M,TSB_BAGR_MAKAM_12M.M,2026-06,3.2644423268,YP",
    "DWH_SRC_0351_MA,M,TSB_BAGR_MAKAM_12M.M,2026-07,,YP", // pending value
  ].join("\n");

  it("parses the monthly series newest-first, skipping empty values", () => {
    const snapshots = parseMakamCsv(CSV, "2026-07-14T00:00:00Z");
    expect(snapshots.map((snapshot) => snapshot.id)).toEqual([
      "2026-06",
      "2026-05",
      "2026-04",
    ]);
    expect(snapshots[0].anchorPercent).toBeCloseTo(3.2644423268, 10);
    expect(snapshots[0].referenceMonth).toBe(6);
    expect(snapshots[0].status).toBe("live");
  });

  it("rejects empty or malformed CSV", () => {
    expect(() => parseMakamCsv("", "t")).toThrow(/no data rows/);
    expect(() => parseMakamCsv("A,B\n1,2", "t")).toThrow(/header/);
  });

  it("never substitutes the latest month for an unknown pinned ID", () => {
    const snapshots = parseMakamCsv(CSV, "t");
    const { snapshots: picked, missingSnapshotIds } =
      pickMakamSnapshotsForRequest(snapshots, ["2020-01"]);
    expect(missingSnapshotIds).toEqual(["2020-01"]);
    expect(picked.map((snapshot) => snapshot.id)).toEqual(["2026-06"]);

    const pinned = pickMakamSnapshotsForRequest(snapshots, ["2026-04"]);
    expect(pinned.missingSnapshotIds).toEqual([]);
    expect(pinned.snapshots.map((snapshot) => snapshot.id)).toEqual([
      "2026-06",
      "2026-04",
    ]);
  });

  it("preserves snapshot metadata: reference month, fetchedAt, sourceId", () => {
    const snapshots = parseMakamCsv(CSV, "2026-07-16T08:00:00Z");
    const latest = snapshots[0];
    expect(latest.referenceYear).toBe(2026);
    expect(latest.referenceMonth).toBe(6); // observation month
    expect(latest.fetchedAt).toBe("2026-07-16T08:00:00Z"); // check time
    expect(latest.sourceId).toBe("boi-secdwh-makam-12m");
    expect(latest.id).not.toBe(latest.fetchedAt);
  });

  it("keeps a valid dated fallback that is never labeled live", () => {
    const fallback = createFallbackMakamSnapshot("2026-07-14T00:00:00Z");
    expect(fallback.status).toBe("fallback");
    expect(fallback.status).not.toBe("live");
    expect(fallback.id).toBe("2026-06");
    expect(fallback.anchorPercent).toBeCloseTo(3.2644423268, 10);
    expect(fallback.fetchedAt).toBe("2026-07-14T00:00:00Z");
  });
});
