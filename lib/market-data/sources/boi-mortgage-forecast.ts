/**
 * Server-only fetch half of the official BOI Directive-451 forecast-curve
 * adapter. Downloads and decodes both official workbooks with exceljs, then
 * delegates all parsing/selection to the pure module.
 */

import "server-only";
import { dailyServerCache } from "../daily-server-cache";

import type { MortgageForecastCurveSnapshot, MortgageForecastData } from "../mortgage-forecast-types";
import { createFallbackForecastCurve } from "../mortgage-forecast-fallback";
import {
  FORECAST_SOURCE_ID,
  buildForecastCurveHistory,
  effectiveCurvesAt,
  isValidCurveSnapshot,
  parseCpiIndexRow,
  parseCurveRow,
  parseScheduleRow,
  pickCurvesForRequest,
  type ParsedScheduleEntry,
  type RawRow,
} from "./boi-mortgage-forecast-parse";

export const FORECAST_WORKBOOK_URL =
  "https://www.boi.org.il/boi_files/Statistics/Estimation%20of%20yields%20from%20government%20bonds.xlsx";
export const SCHEDULE_WORKBOOK_URL =
  "https://www.boi.org.il/boi_files/Statistics/The_data_publication_dates_of_the_nominal_and_real_yields_calculated_on_the_basis_of_a_model_-_NBT_Code_451.xlsx";

/** Normalize an exceljs cell value into a plain JS value. */
function plainCellValue(value: unknown): unknown {
  if (value !== null && typeof value === "object" && "richText" in (value as object)) {
    return (value as { richText: Array<{ text: string }> }).richText
      .map((part) => part.text)
      .join("");
  }
  if (value !== null && typeof value === "object" && "result" in (value as object)) {
    return (value as { result: unknown }).result;
  }
  return value;
}

interface Worksheetish {
  rowCount: number;
  getRow(index: number): { getCell(index: number): { value: unknown } };
}

function extractSheetRows(sheet: Worksheetish, columns: number): RawRow[] {
  const rows: RawRow[] = [];
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const cells: unknown[] = [];
    for (let c = 1; c <= columns; c++) {
      cells.push(plainCellValue(row.getCell(c).value));
    }
    rows.push(cells);
  }
  return rows;
}

async function fetchWorkbook(url: string) {
  const response = await fetch(url, {
    cache: "no-store", // validated parsed workbooks are cached as a unit
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) {
    throw new Error(`BOI workbook responded with status ${response.status}`);
  }
  // exceljs is server-only; dynamic import keeps it out of shared bundles.
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  return workbook;
}

async function fetchWorkbookHistory(): Promise<MortgageForecastCurveSnapshot[]> {
  const fetchedAt = new Date().toISOString();
  const [curveBook, scheduleBook] = await Promise.all([
    fetchWorkbook(FORECAST_WORKBOOK_URL),
    fetchWorkbook(SCHEDULE_WORKBOOK_URL),
  ]);

  const nominalSheet = curveBook.worksheets[0];
  const realSheet = curveBook.worksheets[1];
  // Third sheet ("התפתחות פער התשואות"): the cumulative expected CPI index
  // (base 100 at maturity 0, months 0..360) — the Directive-451 linkage
  // forecast for CPI-linked tracks.
  const cpiSheet = curveBook.worksheets[2];
  if (!nominalSheet || !realSheet || !cpiSheet) {
    throw new Error("BOI curve workbook is missing expected sheets");
  }

  const nominalRows = extractSheetRows(nominalSheet, 363)
    .map(parseCurveRow)
    .filter((row) => row !== null);
  const realRows = extractSheetRows(realSheet, 363)
    .map(parseCurveRow)
    .filter((row) => row !== null);
  const cpiIndexRows = extractSheetRows(cpiSheet, 364)
    .map(parseCpiIndexRow)
    .filter((row) => row !== null);

  const schedule: ParsedScheduleEntry[] = [];
  for (const sheet of scheduleBook.worksheets) {
    for (const cells of extractSheetRows(sheet, 4)) {
      const entry = parseScheduleRow(cells);
      if (entry) schedule.push(entry);
    }
  }

  // Validate before replacing the last successful snapshot.
  const history = buildForecastCurveHistory(nominalRows, realRows, schedule, fetchedAt, cpiIndexRows).filter(isValidCurveSnapshot);
  if (!effectiveCurvesAt(history, new Date()).length) throw new Error("No valid effective curve rows found in BOI workbook");
  return history;
}

// New key: older cache entries contain raw rows rather than joined snapshots.
const readDailyHistory = dailyServerCache("forecast-curve-history-v2", fetchWorkbookHistory);

/** Newest snapshots kept in a separate small cache entry. The full history
 * is ~1 MB and grows by two curves a month; most requests need only the
 * operative curve, so they read this entry and the full one is read only
 * for a pinned curve outside it. Six covers any future-dated curves that
 * are waiting to activate plus the operative ones (history is newest first). */
const RECENT_CURVE_COUNT = 6;
const readDailyRecent = dailyServerCache("forecast-curve-recent-v1",
  async () => (await fetchWorkbookHistory()).slice(0, RECENT_CURVE_COUNT));

/**
 * Fetch, parse, and resolve the official forecast curves for one request.
 *
 * The FULL workbook history is parsed server-side; only the latest
 * effective curve plus the explicitly requested historical curves are
 * returned (and thus reach the client). The full cached history is read
 * only when a requested ID is not among the recent curves. Requested IDs that don't exist are
 * reported in `missingCurveIds`, never silently replaced.
 *
 * Never throws: on any failure it returns the dated bundled fallback with
 * status "fallback" and a sanitized error list.
 */
export async function getMortgageForecastData(
  requestedCurveIds: readonly string[] = [],
): Promise<MortgageForecastData> {
  const fetchedAt = new Date().toISOString();
  try {
    const now = new Date();
    const recentHistory = (await readDailyRecent()).value;
    const recent = effectiveCurvesAt(recentHistory, now);

    if (recent.length === 0) {
      throw new Error("No valid effective curve rows found in BOI workbook");
    }

    // A recent ID that isn't effective yet is reported missing, as before;
    // only IDs older than the recent window need the full history.
    const needsHistory = requestedCurveIds.some(
      (id) => id !== "" && !recentHistory.some((curve) => curve.id === id),
    );
    // Recent curves stay first, so the latest curve comes from the fresher entry.
    const effective = needsHistory
      ? [
          ...recent,
          ...effectiveCurvesAt((await readDailyHistory()).value, now).filter(
            (curve) => !recent.some((item) => item.id === curve.id),
          ),
        ]
      : recent;

    const { curves, missingCurveIds } = pickCurvesForRequest(
      effective,
      requestedCurveIds,
    );
    return { curves, missingCurveIds, status: "live", errors: [] };
  } catch (reason) {
    const message =
      reason instanceof Error ? reason.message : "Unknown source error";
    const fallback = createFallbackForecastCurve(fetchedAt);
    const { curves, missingCurveIds } = pickCurvesForRequest(
      [fallback],
      requestedCurveIds,
    );
    return {
      curves,
      missingCurveIds,
      status: "fallback",
      errors: [{ sourceId: FORECAST_SOURCE_ID, message }],
    };
  }
}
