import { describe, expect, it } from "vitest";
import {
  coerceTrackDraftFromUnknown,
  extractPinnedCurveIds,
  extractPinnedMakamSnapshotIds,
  isValidResultSnapshot,
  MAX_SCENARIO_NAME_LENGTH,
  MIN_SCENARIO_NAME_LENGTH,
  validateInputPayload,
  validateScenarioName,
} from "../payload";

describe("validateScenarioName", () => {
  it("keeps a valid trimmed name", () => {
    expect(validateScenarioName("  My scenario  ")).toBe("My scenario");
  });

  it("accepts the exact boundary lengths", () => {
    expect(validateScenarioName("a".repeat(MIN_SCENARIO_NAME_LENGTH))).toBe(
      "a".repeat(MIN_SCENARIO_NAME_LENGTH),
    );
    expect(validateScenarioName("a".repeat(MAX_SCENARIO_NAME_LENGTH))).toBe(
      "a".repeat(MAX_SCENARIO_NAME_LENGTH),
    );
  });

  it("rejects empty, whitespace-only, and over-length names", () => {
    expect(validateScenarioName("")).toBeNull();
    expect(validateScenarioName("   ")).toBeNull();
    expect(validateScenarioName("a".repeat(MAX_SCENARIO_NAME_LENGTH + 1))).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(validateScenarioName(undefined)).toBeNull();
    expect(validateScenarioName(null)).toBeNull();
    expect(validateScenarioName(42)).toBeNull();
    expect(validateScenarioName(["name"])).toBeNull();
  });
});

describe("coerceTrackDraftFromUnknown", () => {
  it("picks only known string fields off a well-formed object", () => {
    const draft = coerceTrackDraftFromUnknown(
      {
        id: "track-9",
        amount: "800000",
        ratePercent: "4.8",
        years: "25",
        trackType: "fixedUnlinked",
        repaymentMethod: "spitzer",
      },
      0,
    );
    expect(draft.id).toBe("track-9");
    expect(draft.amount).toBe("800000");
    expect(draft.ratePercent).toBe("4.8");
    expect(draft.years).toBe("25");
    expect(draft.trackType).toBe("fixedUnlinked");
    expect(draft.repaymentMethod).toBe("spitzer");
  });

  it("defaults missing or wrong-typed fields to empty strings instead of throwing", () => {
    const draft = coerceTrackDraftFromUnknown(
      { amount: 800000, years: null, trackType: ["fixedUnlinked"] },
      2,
    );
    expect(draft.amount).toBe("");
    expect(draft.years).toBe("");
    expect(draft.trackType).toBe("");
    expect(draft.id).toBe("track-3");
  });

  it("never spreads unknown/extra keys from the raw object onto the draft", () => {
    const draft = coerceTrackDraftFromUnknown(
      { amount: "800000", extraField: "danger", anotherOne: 123 },
      0,
    ) as unknown as Record<string, unknown>;
    expect(draft.extraField).toBeUndefined();
    expect(draft.anotherOne).toBeUndefined();
    expect(Object.keys(draft).sort()).toEqual(
      [
        "amount",
        "currentRatePercent",
        "forecastCurveId",
        "forecastMode",
        "id",
        "inflationStressShift",
        "makamSnapshotId",
        "ratePercent",
        "repaymentMethod",
        "resetPeriodMonths",
        "stressShift",
        "trackType",
        "years",
      ].sort(),
    );
  });

  it("handles completely non-object input by defaulting every field", () => {
    for (const raw of [null, undefined, "a string", 42, [1, 2, 3]]) {
      const draft = coerceTrackDraftFromUnknown(raw, 4);
      expect(draft.amount).toBe("");
      expect(draft.trackType).toBe("");
      expect(draft.id).toBe("track-5");
    }
  });
});

function validRawTrack(overrides?: Record<string, unknown>) {
  return {
    id: "track-1",
    amount: "800000",
    ratePercent: "4.8",
    years: "25",
    trackType: "fixedUnlinked",
    repaymentMethod: "spitzer",
    currentRatePercent: "",
    resetPeriodMonths: "",
    forecastMode: "official",
    stressShift: "",
    inflationStressShift: "",
    forecastCurveId: "",
    makamSnapshotId: "",
    ...overrides,
  };
}

describe("validateInputPayload", () => {
  it("accepts a well-formed payload with 1-5 tracks", () => {
    const payload = validateInputPayload({
      schemaVersion: 1,
      tracks: [validRawTrack()],
    });
    expect(payload).not.toBeNull();
    expect(payload!.tracks).toHaveLength(1);

    const fiveTracks = validateInputPayload({
      schemaVersion: 1,
      tracks: [1, 2, 3, 4, 5].map(() => validRawTrack()),
    });
    expect(fiveTracks).not.toBeNull();
    expect(fiveTracks!.tracks).toHaveLength(5);
  });

  it("rejects a wrong or missing schemaVersion", () => {
    expect(
      validateInputPayload({ schemaVersion: 2, tracks: [validRawTrack()] }),
    ).toBeNull();
    expect(validateInputPayload({ tracks: [validRawTrack()] })).toBeNull();
  });

  it("rejects a non-object payload", () => {
    expect(validateInputPayload(null)).toBeNull();
    expect(validateInputPayload("not an object")).toBeNull();
    expect(validateInputPayload(42)).toBeNull();
  });

  it("rejects a non-array or empty tracks list", () => {
    expect(
      validateInputPayload({ schemaVersion: 1, tracks: "not an array" }),
    ).toBeNull();
    expect(validateInputPayload({ schemaVersion: 1, tracks: [] })).toBeNull();
  });

  it("rejects more than the product's 5-track maximum", () => {
    const sixTracks = validateInputPayload({
      schemaVersion: 1,
      tracks: [1, 2, 3, 4, 5, 6].map(() => validRawTrack()),
    });
    expect(sixTracks).toBeNull();
  });
});

describe("extractPinnedCurveIds / extractPinnedMakamSnapshotIds", () => {
  it("collects deduplicated pinned IDs and ignores unpinned tracks", () => {
    const payload = validateInputPayload({
      schemaVersion: 1,
      tracks: [
        validRawTrack({ forecastCurveId: "2026-06-calendar" }),
        validRawTrack({ forecastCurveId: "2026-06-calendar" }),
        validRawTrack({ forecastCurveId: "" }),
        validRawTrack({
          trackType: "variableMakam",
          makamSnapshotId: "2026-06",
        }),
      ],
    })!;
    expect(extractPinnedCurveIds(payload)).toEqual(["2026-06-calendar"]);
    expect(extractPinnedMakamSnapshotIds(payload)).toEqual(["2026-06"]);
  });

  it("returns an empty array when nothing is pinned", () => {
    const payload = validateInputPayload({
      schemaVersion: 1,
      tracks: [validRawTrack()],
    })!;
    expect(extractPinnedCurveIds(payload)).toEqual([]);
    expect(extractPinnedMakamSnapshotIds(payload)).toEqual([]);
  });
});

function validResultSnapshot(overrides?: Record<string, unknown>) {
  return {
    schemaVersion: 1,
    totalPrincipal: 800_000,
    firstPayment: 4583.98,
    highestPayment: 4583.98,
    highestPaymentMonth: 1,
    forecastTotalPaid: 1_375_192.71,
    totalInterestOrFinancingCost: 575_192.71,
    stabilityScore: 100,
    trackCount: 1,
    ...overrides,
  };
}

describe("isValidResultSnapshot", () => {
  it("accepts a well-formed snapshot", () => {
    expect(isValidResultSnapshot(validResultSnapshot())).toBe(true);
  });

  it("rejects a wrong schemaVersion", () => {
    expect(isValidResultSnapshot(validResultSnapshot({ schemaVersion: 2 }))).toBe(
      false,
    );
  });

  it("rejects a missing or non-numeric field", () => {
    const { totalPrincipal: _omitted, ...missingField } =
      validResultSnapshot();
    expect(isValidResultSnapshot(missingField)).toBe(false);
    expect(
      isValidResultSnapshot(validResultSnapshot({ trackCount: "1" })),
    ).toBe(false);
  });

  it("rejects NaN/Infinity values", () => {
    expect(
      isValidResultSnapshot(validResultSnapshot({ stabilityScore: NaN })),
    ).toBe(false);
    expect(
      isValidResultSnapshot(
        validResultSnapshot({ forecastTotalPaid: Infinity }),
      ),
    ).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(isValidResultSnapshot(null)).toBe(false);
    expect(isValidResultSnapshot("snapshot")).toBe(false);
  });
});
