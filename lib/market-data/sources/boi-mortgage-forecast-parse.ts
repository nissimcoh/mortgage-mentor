/**
 * Official Bank of Israel Directive-451 mortgage-forecast curve adapter.
 *
 * Sources (both official BOI publications):
 * - Curve workbook: nominal + real zero yields derived from the model,
 *   monthly maturities 1–360, one row per (year, Hebrew month, average type).
 * - Publication-schedule workbook (NBT Code 451): the official dates each
 *   row is published; a row becomes operative at the opening of the next
 *   business day (Israeli week: Sunday–Thursday).
 *
 * This module is the PURE half of the adapter: row parsing, schedule
 * joining, effective-date selection, and validation. No fetching, no
 * exceljs — fully unit-testable. The server-only fetch lives in
 * ./boi-mortgage-forecast.ts.
 */

import type {
  ForecastCurveAverageType,
  MortgageForecastCurveSnapshot,
} from "../mortgage-forecast-types";

export const FORECAST_WORKBOOK_URL =
  "https://www.boi.org.il/boi_files/Statistics/Estimation%20of%20yields%20from%20government%20bonds.xlsx";
export const SCHEDULE_WORKBOOK_URL =
  "https://www.boi.org.il/boi_files/Statistics/The_data_publication_dates_of_the_nominal_and_real_yields_calculated_on_the_basis_of_a_model_-_NBT_Code_451.xlsx";

export const FORECAST_SOURCE_ID = "boi-directive-451-forecast-workbook";

const MATURITY_MONTHS = 360;

export const HEBREW_MONTHS: Record<string, number> = {
  ינואר: 1,
  פברואר: 2,
  מרץ: 3,
  אפריל: 4,
  מאי: 5,
  יוני: 6,
  יולי: 7,
  אוגוסט: 8,
  ספטמבר: 9,
  אוקטובר: 10,
  נובמבר: 11,
  דצמבר: 12,
};

const AVERAGE_TYPES: Record<string, ForecastCurveAverageType> = {
  קלנדרי: "calendar",
  מדדי: "index",
};

/** One raw worksheet row as plain JS values (exceljs already stripped). */
export type RawRow = unknown[];

export interface ParsedCurveRow {
  referenceYear: number;
  referenceMonth: number;
  averageType: ForecastCurveAverageType;
  yieldsPercent: number[]; // exactly 360, maturities 1..360 in order
}

export interface ParsedScheduleEntry {
  publicationDate: string; // ISO date
  referenceYear: number;
  referenceMonth: number;
  averageType: ForecastCurveAverageType;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value === "string") return value.trim();
  return null;
}

/**
 * Parse one curve-workbook data row: [year, hebrewMonth, averageType,
 * yield@1m, ..., yield@360m]. Returns null for non-data rows (titles,
 * footnotes, headers).
 */
export function parseCurveRow(cells: RawRow): ParsedCurveRow | null {
  const year = cells[0];
  const month = asTrimmedString(cells[1]);
  const averageTypeText = asTrimmedString(cells[2]);
  if (typeof year !== "number" || !Number.isInteger(year)) return null;
  if (month === null || !(month in HEBREW_MONTHS)) return null;
  if (averageTypeText === null || !(averageTypeText in AVERAGE_TYPES)) {
    return null;
  }

  const yields = cells.slice(3, 3 + MATURITY_MONTHS);
  if (yields.length !== MATURITY_MONTHS) return null;
  if (!yields.every((value) => typeof value === "number" && Number.isFinite(value))) {
    return null;
  }

  return {
    referenceYear: year,
    referenceMonth: HEBREW_MONTHS[month],
    averageType: AVERAGE_TYPES[averageTypeText],
    yieldsPercent: yields as number[],
  };
}

/** Parse one schedule row: [publicationDate, year, hebrewMonth, averageType]. */
export function parseScheduleRow(cells: RawRow): ParsedScheduleEntry | null {
  const publication = cells[0];
  const year = cells[1];
  const month = asTrimmedString(cells[2]);
  const averageTypeText = asTrimmedString(cells[3]);

  let publicationDate: string | null = null;
  if (publication instanceof Date && !Number.isNaN(publication.getTime())) {
    publicationDate = publication.toISOString().slice(0, 10);
  } else if (
    typeof publication === "string" &&
    Number.isFinite(Date.parse(publication))
  ) {
    publicationDate = publication.slice(0, 10);
  }

  if (publicationDate === null) return null;
  if (typeof year !== "number" || !Number.isInteger(year)) return null;
  if (month === null || !(month in HEBREW_MONTHS)) return null;
  if (averageTypeText === null || !(averageTypeText in AVERAGE_TYPES)) {
    return null;
  }

  return {
    publicationDate,
    referenceYear: year,
    referenceMonth: HEBREW_MONTHS[month],
    averageType: AVERAGE_TYPES[averageTypeText],
  };
}

/**
 * The opening of the next Israeli business day after `isoDate`.
 * Israeli weekend is Friday–Saturday; Sunday is a business day.
 */
export function nextIsraeliBusinessDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  do {
    date.setUTCDate(date.getUTCDate() + 1);
  } while (date.getUTCDay() === 5 || date.getUTCDay() === 6); // Fri, Sat
  return date.toISOString().slice(0, 10);
}

function curveKey(year: number, month: number, type: ForecastCurveAverageType) {
  return `${year}-${String(month).padStart(2, "0")}-${type}`;
}

export function buildCurveId(
  year: number,
  month: number,
  type: ForecastCurveAverageType,
): string {
  return curveKey(year, month, type);
}

/**
 * Join curve rows with schedule entries, keep rows whose effective date
 * (opening of the business day after publication) is not in the future,
 * and return them newest-effective-first. A curve row without a schedule
 * entry (schedule unavailable or older years) is assumed effective —
 * the workbook only ever contains published rows — but curve rows are
 * still ordered by reference month and capped to the requested count.
 */
export function selectEffectiveCurves(
  nominalRows: ParsedCurveRow[],
  realRows: ParsedCurveRow[],
  schedule: ParsedScheduleEntry[],
  now: Date,
  fetchedAt: string,
  count: number = Number.POSITIVE_INFINITY,
): MortgageForecastCurveSnapshot[] {
  const realByKey = new Map(
    realRows.map((row) => [
      curveKey(row.referenceYear, row.referenceMonth, row.averageType),
      row,
    ]),
  );
  const scheduleByKey = new Map(
    schedule.map((entry) => [
      curveKey(entry.referenceYear, entry.referenceMonth, entry.averageType),
      entry,
    ]),
  );

  const nowIso = now.toISOString().slice(0, 10);
  const snapshots: MortgageForecastCurveSnapshot[] = [];

  for (const row of nominalRows) {
    const key = curveKey(row.referenceYear, row.referenceMonth, row.averageType);
    const scheduled = scheduleByKey.get(key);
    const publicationDate = scheduled?.publicationDate ?? "";
    const effectiveDate = scheduled
      ? nextIsraeliBusinessDay(scheduled.publicationDate)
      : "";
    // Skip rows that are published but not yet operative.
    if (effectiveDate !== "" && effectiveDate > nowIso) continue;

    snapshots.push({
      id: key,
      referenceYear: row.referenceYear,
      referenceMonth: row.referenceMonth,
      averageType: row.averageType,
      publicationDate,
      effectiveDate,
      nominalZeroYieldsPercent: row.yieldsPercent,
      realZeroYieldsPercent: realByKey.get(key)?.yieldsPercent ?? [],
      fetchedAt,
      status: "live",
      sourceId: FORECAST_SOURCE_ID,
    });
  }

  snapshots.sort((a, b) => {
    if (a.referenceYear !== b.referenceYear) return b.referenceYear - a.referenceYear;
    if (a.referenceMonth !== b.referenceMonth) return b.referenceMonth - a.referenceMonth;
    // Same month: the later publication wins the tie (calendar follows index).
    return (b.effectiveDate || "").localeCompare(a.effectiveDate || "");
  });

  return Number.isFinite(count) ? snapshots.slice(0, count) : snapshots;
}

export interface CurveRequestResolution {
  /** The latest effective curve first, then any found requested curves. */
  curves: MortgageForecastCurveSnapshot[];
  /** Requested curve IDs that do not exist in the workbook history. */
  missingCurveIds: string[];
}

/**
 * Resolve explicitly requested curve IDs against the full effective
 * history. An unknown requested ID is reported in `missingCurveIds` and is
 * NEVER silently substituted with the latest curve — the caller must
 * surface it to the user. The latest curve is always included: it is what
 * gets used when no ID was requested.
 */
export function pickCurvesForRequest(
  effectiveCurves: MortgageForecastCurveSnapshot[],
  requestedCurveIds: readonly string[],
): CurveRequestResolution {
  const curves = effectiveCurves.length > 0 ? [effectiveCurves[0]] : [];
  const missingCurveIds: string[] = [];

  for (const id of new Set(requestedCurveIds)) {
    if (id === "") continue;
    const found = effectiveCurves.find((curve) => curve.id === id);
    if (!found) {
      missingCurveIds.push(id);
    } else if (!curves.some((curve) => curve.id === id)) {
      curves.push(found);
    }
  }

  return { curves, missingCurveIds };
}

/** Validate the invariants promised by MortgageForecastCurveSnapshot. */
export function isValidCurveSnapshot(
  snapshot: MortgageForecastCurveSnapshot,
): boolean {
  return (
    snapshot.nominalZeroYieldsPercent.length === MATURITY_MONTHS &&
    snapshot.nominalZeroYieldsPercent.every(Number.isFinite) &&
    (snapshot.realZeroYieldsPercent.length === 0 ||
      (snapshot.realZeroYieldsPercent.length === MATURITY_MONTHS &&
        snapshot.realZeroYieldsPercent.every(Number.isFinite))) &&
    Number.isInteger(snapshot.referenceYear) &&
    snapshot.referenceMonth >= 1 &&
    snapshot.referenceMonth <= 12 &&
    snapshot.id ===
      curveKey(
        snapshot.referenceYear,
        snapshot.referenceMonth,
        snapshot.averageType,
      )
  );
}
