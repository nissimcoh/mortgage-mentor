import { describe, expect, it } from "vitest";
import {
  buildCurveId,
  isValidCurveSnapshot,
  nextIsraeliBusinessDay,
  parseCurveRow,
  parseScheduleRow,
  pickCurvesForRequest,
  selectEffectiveCurves,
  type ParsedCurveRow,
  type ParsedScheduleEntry,
} from "../sources/boi-mortgage-forecast-parse";
import { createFallbackForecastCurve } from "../mortgage-forecast-fallback";

// Fixture rows mirror the official workbook layout:
// [year, hebrewMonth, averageType, yield@1m..yield@360m]
function curveRowCells(
  year: number,
  month: string,
  type: string,
  base: number,
): unknown[] {
  return [
    year,
    month,
    type,
    ...Array.from({ length: 360 }, (_, i) => base + i * 0.001),
  ];
}

const FETCHED_AT = "2026-07-12T00:00:00Z";

describe("curve row parsing", () => {
  it("parses a valid data row", () => {
    const row = parseCurveRow(curveRowCells(2026, "יוני", "קלנדרי", 3.6));
    expect(row).not.toBeNull();
    expect(row!.referenceYear).toBe(2026);
    expect(row!.referenceMonth).toBe(6);
    expect(row!.averageType).toBe("calendar");
    expect(row!.yieldsPercent).toHaveLength(360);
  });

  it("trims Hebrew month names (the workbook contains trailing spaces)", () => {
    const row = parseCurveRow(curveRowCells(2026, "אפריל ", "מדדי", 3.9));
    expect(row!.referenceMonth).toBe(4);
    expect(row!.averageType).toBe("index");
  });

  it("rejects titles, headers, footnotes, and incomplete rows", () => {
    expect(parseCurveRow(["התשואה הנומינלית", null, null])).toBeNull();
    expect(parseCurveRow(["שנה", "חודש", "סוג ממוצע"])).toBeNull();
    expect(parseCurveRow([2026, "יוני", "קלנדרי", 1, 2, 3])).toBeNull();
    const withGap = curveRowCells(2026, "יוני", "קלנדרי", 3.6);
    withGap[100] = null;
    expect(parseCurveRow(withGap)).toBeNull();
  });
});

describe("schedule row parsing", () => {
  it("parses date objects and month names", () => {
    const entry = parseScheduleRow([
      new Date("2026-07-02T00:00:00Z"),
      2026,
      "יוני",
      "קלנדרי",
    ]);
    expect(entry).toEqual({
      publicationDate: "2026-07-02",
      referenceYear: 2026,
      referenceMonth: 6,
      averageType: "calendar",
    });
  });

  it("rejects header and empty rows", () => {
    expect(parseScheduleRow(["מועד פרסום הנתונים*", null, null, null])).toBeNull();
    expect(parseScheduleRow([null, "שנה ", "חודש", "סוג ממוצע**"])).toBeNull();
  });
});

describe("Israeli business-day rule", () => {
  it("moves past the Israeli weekend (Fri-Sat)", () => {
    expect(nextIsraeliBusinessDay("2026-07-02")).toBe("2026-07-05"); // Thu → Sun
    expect(nextIsraeliBusinessDay("2026-07-06")).toBe("2026-07-07"); // Mon → Tue
    expect(nextIsraeliBusinessDay("2026-07-09")).toBe("2026-07-12"); // Thu → Sun
  });
});

describe("effective-curve selection", () => {
  const nominalRows = [
    parseCurveRow(curveRowCells(2026, "מאי", "קלנדרי", 3.9))!,
    parseCurveRow(curveRowCells(2026, "יוני", "מדדי", 3.7))!,
    parseCurveRow(curveRowCells(2026, "יוני", "קלנדרי", 3.6))!,
  ];
  const realRows: ParsedCurveRow[] = [];
  const schedule: ParsedScheduleEntry[] = [
    // May calendar: published Jun 2 → effective Jun 3
    { publicationDate: "2026-06-02", referenceYear: 2026, referenceMonth: 5, averageType: "calendar" },
    // June index: published Jun 17 → effective Jun 18
    { publicationDate: "2026-06-17", referenceYear: 2026, referenceMonth: 6, averageType: "index" },
    // June calendar: published Jul 2 (Thu) → effective Jul 5 (Sun)
    { publicationDate: "2026-07-02", referenceYear: 2026, referenceMonth: 6, averageType: "calendar" },
  ];

  it("selects the latest effective publication, calendar or index", () => {
    const onJul12 = selectEffectiveCurves(
      nominalRows, realRows, schedule, new Date("2026-07-12T10:00:00Z"), FETCHED_AT,
    );
    expect(onJul12[0].id).toBe("2026-06-calendar");
    expect(onJul12[0].effectiveDate).toBe("2026-07-05");
    expect(onJul12.map((curve) => curve.id)).toEqual([
      "2026-06-calendar",
      "2026-06-index",
      "2026-05-calendar",
    ]);
  });

  it("skips a published-but-not-yet-effective row", () => {
    // On Jul 3 (Fri) the June-calendar row exists but is effective Jul 5.
    const onJul3 = selectEffectiveCurves(
      nominalRows, realRows, schedule, new Date("2026-07-03T10:00:00Z"), FETCHED_AT,
    );
    expect(onJul3[0].id).toBe("2026-06-index");
  });

  it("keeps reference, publication, effective, and fetch dates separate", () => {
    const [latest] = selectEffectiveCurves(
      nominalRows, realRows, schedule, new Date("2026-07-12T10:00:00Z"), FETCHED_AT,
    );
    expect(latest.referenceYear).toBe(2026);
    expect(latest.referenceMonth).toBe(6); // observation period: June
    expect(latest.publicationDate).toBe("2026-07-02");
    expect(latest.effectiveDate).toBe("2026-07-05");
    expect(latest.fetchedAt).toBe(FETCHED_AT);
    // All four are distinct facts.
    expect(latest.publicationDate).not.toBe(latest.effectiveDate);
    expect(latest.fetchedAt).not.toBe(latest.publicationDate);
  });

  it("produces valid snapshots with empty real curves allowed", () => {
    const curves = selectEffectiveCurves(
      nominalRows, realRows, schedule, new Date("2026-07-12T10:00:00Z"), FETCHED_AT,
    );
    expect(curves.every(isValidCurveSnapshot)).toBe(true);
    expect(curves[0].realZeroYieldsPercent).toEqual([]);
  });
});

describe("request-scoped curve resolution", () => {
  const history = selectEffectiveCurves(
    [
      parseCurveRow(curveRowCells(2026, "אפריל", "קלנדרי", 3.9))!,
      parseCurveRow(curveRowCells(2026, "מאי", "קלנדרי", 3.8))!,
      parseCurveRow(curveRowCells(2026, "יוני", "קלנדרי", 3.6))!,
    ],
    [],
    [],
    new Date("2026-07-12T10:00:00Z"),
    FETCHED_AT,
  );

  it("returns only the latest curve when nothing was requested", () => {
    const { curves, missingCurveIds } = pickCurvesForRequest(history, []);
    expect(curves.map((curve) => curve.id)).toEqual(["2026-06-calendar"]);
    expect(missingCurveIds).toEqual([]);
  });

  it("resolves an explicitly requested historical curve from full history", () => {
    const { curves, missingCurveIds } = pickCurvesForRequest(history, [
      "2026-04-calendar",
    ]);
    expect(curves.map((curve) => curve.id)).toEqual([
      "2026-06-calendar",
      "2026-04-calendar",
    ]);
    expect(missingCurveIds).toEqual([]);
  });

  it("never substitutes the latest curve for an unknown requested ID", () => {
    const { curves, missingCurveIds } = pickCurvesForRequest(history, [
      "2020-01-calendar",
    ]);
    expect(missingCurveIds).toEqual(["2020-01-calendar"]);
    // The latest is present for unpinned tracks, but the unknown ID is
    // reported missing — not resolved to anything.
    expect(curves.map((curve) => curve.id)).toEqual(["2026-06-calendar"]);
  });

  it("deduplicates and ignores empty requested IDs", () => {
    const { curves, missingCurveIds } = pickCurvesForRequest(history, [
      "",
      "2026-06-calendar",
      "2026-06-calendar",
    ]);
    expect(curves.map((curve) => curve.id)).toEqual(["2026-06-calendar"]);
    expect(missingCurveIds).toEqual([]);
  });
});

describe("fallback snapshot", () => {
  it("is a valid snapshot, clearly labeled and dated", () => {
    const fallback = createFallbackForecastCurve(FETCHED_AT);
    expect(fallback.status).toBe("fallback");
    expect(fallback.id).toBe(buildCurveId(2026, 6, "calendar"));
    expect(fallback.publicationDate).toBe("2026-07-02");
    expect(fallback.nominalZeroYieldsPercent).toHaveLength(360);
    expect(fallback.realZeroYieldsPercent).toHaveLength(360);
    expect(isValidCurveSnapshot(fallback)).toBe(true);
  });
});
