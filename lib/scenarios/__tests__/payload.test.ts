import { describe, expect, it } from "vitest";
import {
  buildDuplicateName,
  buildDuplicateRow,
  coerceTrackDraftFromUnknown,
  extractPinnedCurveIds,
  extractPinnedMakamSnapshotIds,
  isValidMarketReferences,
  isValidResultSnapshot,
  MAX_SCENARIO_NAME_LENGTH,
  MIN_SCENARIO_NAME_LENGTH,
  validateInputPayload,
  validateScenarioName,
  type DuplicateScenarioSource,
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

function validMarketReferences(overrides?: Record<string, unknown>) {
  return {
    schemaVersion: 1,
    boiRatePercent: 3.5,
    boiRateEffectiveDate: "2026-01-01",
    tracks: [
      { trackId: "track-1", forecastCurveId: null, makamSnapshotId: null },
      {
        trackId: "track-2",
        forecastCurveId: "2026-06-calendar",
        makamSnapshotId: "2026-06",
      },
    ],
    ...overrides,
  };
}

describe("isValidMarketReferences", () => {
  it("accepts a well-formed value, including null curve/Makam IDs", () => {
    expect(isValidMarketReferences(validMarketReferences())).toBe(true);
  });

  it("rejects a wrong schemaVersion", () => {
    expect(
      isValidMarketReferences(validMarketReferences({ schemaVersion: 2 })),
    ).toBe(false);
  });

  it("rejects a non-finite or missing boiRatePercent", () => {
    expect(
      isValidMarketReferences(validMarketReferences({ boiRatePercent: NaN })),
    ).toBe(false);
    expect(
      isValidMarketReferences(
        validMarketReferences({ boiRatePercent: "3.5" }),
      ),
    ).toBe(false);
  });

  it("rejects a missing or empty boiRateEffectiveDate", () => {
    expect(
      isValidMarketReferences(
        validMarketReferences({ boiRateEffectiveDate: "" }),
      ),
    ).toBe(false);
    expect(
      isValidMarketReferences(
        validMarketReferences({ boiRateEffectiveDate: undefined }),
      ),
    ).toBe(false);
  });

  it("rejects a non-array tracks field", () => {
    expect(
      isValidMarketReferences(validMarketReferences({ tracks: "nope" })),
    ).toBe(false);
  });

  it("rejects a track with a non-string trackId or wrong-typed curve/Makam ids", () => {
    expect(
      isValidMarketReferences(
        validMarketReferences({
          tracks: [{ trackId: 1, forecastCurveId: null, makamSnapshotId: null }],
        }),
      ),
    ).toBe(false);
    expect(
      isValidMarketReferences(
        validMarketReferences({
          tracks: [
            { trackId: "t1", forecastCurveId: 42, makamSnapshotId: null },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(isValidMarketReferences(null)).toBe(false);
    expect(isValidMarketReferences("refs")).toBe(false);
  });
});

describe("buildDuplicateName", () => {
  it("appends the Hebrew suffix for a Hebrew-locale source scenario", () => {
    expect(buildDuplicateName("תמהיל לדוגמה", "he")).toBe(
      "תמהיל לדוגמה — עותק",
    );
  });

  it("appends the English suffix for an English-locale source scenario", () => {
    expect(buildDuplicateName("Sample scenario", "en")).toBe(
      "Sample scenario — Copy",
    );
  });

  it("falls back to the default locale's suffix for an invalid/missing locale", () => {
    expect(buildDuplicateName("Sample scenario", "fr")).toBe(
      buildDuplicateName("Sample scenario", undefined),
    );
  });

  it("truncates a long name so the combined result stays within the limit, keeping the suffix intact", () => {
    const longName = "a".repeat(MAX_SCENARIO_NAME_LENGTH);
    const result = buildDuplicateName(longName, "en");
    expect(result.length).toBeLessThanOrEqual(MAX_SCENARIO_NAME_LENGTH);
    expect(result.endsWith(" — Copy")).toBe(true);
  });

  it("keeps names that already fit comfortably unchanged aside from the suffix", () => {
    const result = buildDuplicateName("Short name", "en", 120);
    expect(result).toBe("Short name — Copy");
    expect(result.length).toBeLessThanOrEqual(120);
  });

  it("respects a custom maxLength for truncation", () => {
    const result = buildDuplicateName("A fairly long original name here", "en", 20);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result.endsWith(" — Copy")).toBe(true);
  });
});

function duplicateSource(
  overrides?: Partial<DuplicateScenarioSource>,
): DuplicateScenarioSource {
  const payload = validateInputPayload({
    schemaVersion: 1,
    tracks: [validRawTrack()],
  })!;
  return {
    name: "Original scenario",
    locale: "en",
    schemaVersion: 1,
    calculatorVersion: "1.0.0",
    inputPayload: payload,
    resultSnapshot: validResultSnapshot() as ReturnType<typeof validResultSnapshot> &
      DuplicateScenarioSource["resultSnapshot"],
    marketReferences: validMarketReferences() as DuplicateScenarioSource["marketReferences"],
    calculatedAt: "2026-01-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("buildDuplicateRow — distinct-row contract", () => {
  it("never includes id, user_id, created_at, or updated_at — the caller adds user_id, the database assigns the rest", () => {
    const row = buildDuplicateRow(duplicateSource());
    const keys = Object.keys(row);
    expect(keys).not.toContain("id");
    expect(keys).not.toContain("user_id");
    expect(keys).not.toContain("created_at");
    expect(keys).not.toContain("updated_at");
  });

  it("preserves input_payload, result_snapshot, market_references, schema_version, calculator_version, locale, and calculated_at verbatim", () => {
    const source = duplicateSource();
    const row = buildDuplicateRow(source);

    expect(row.input_payload).toEqual(source.inputPayload);
    expect(row.result_snapshot).toEqual(source.resultSnapshot);
    expect(row.market_references).toEqual(source.marketReferences);
    expect(row.schema_version).toBe(source.schemaVersion);
    expect(row.calculator_version).toBe(source.calculatorVersion);
    expect(row.locale).toBe(source.locale);
    expect(row.calculated_at).toBe(source.calculatedAt);
  });

  it("applies the duplicate-name suffix rather than reusing the source name verbatim", () => {
    const row = buildDuplicateRow(duplicateSource({ name: "My mortgage" }));
    expect(row.name).toBe("My mortgage — Copy");
  });

  it("always returns a name that itself passes validateScenarioName (non-empty, within 120 chars)", () => {
    const longName = "b".repeat(200);
    const row = buildDuplicateRow(duplicateSource({ name: longName }));
    expect(validateScenarioName(row.name)).not.toBeNull();
    expect(row.name.length).toBeLessThanOrEqual(MAX_SCENARIO_NAME_LENGTH);
  });
});
