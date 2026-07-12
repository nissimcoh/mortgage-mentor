/**
 * Server-only fetch half of the official BOI Directive-451 forecast-curve
 * adapter. Downloads and decodes both official workbooks with exceljs, then
 * delegates all parsing/selection to the pure module.
 */

import "server-only";

import type { MortgageForecastData } from "../mortgage-forecast-types";
import { createFallbackForecastCurve } from "../mortgage-forecast-fallback";
import {
  FORECAST_SOURCE_ID,
  isValidCurveSnapshot,
  parseCurveRow,
  parseScheduleRow,
  pickCurvesForRequest,
  selectEffectiveCurves,
  type ParsedCurveRow,
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
    next: { revalidate: 21600 }, // ~6h: data changes only on scheduled dates
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

interface ParsedWorkbooks {
  nominalRows: ParsedCurveRow[];
  realRows: ParsedCurveRow[];
  schedule: ParsedScheduleEntry[];
  fetchedAt: string;
}

// The workbooks change only on scheduled publication dates; keep the
// parsed rows for ~6h so per-request curve resolution stays cheap even
// though the calculator page renders dynamically.
const PARSE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let parseCache: { at: number; data: ParsedWorkbooks } | null = null;

async function loadWorkbookRows(): Promise<ParsedWorkbooks> {
  if (parseCache && Date.now() - parseCache.at < PARSE_CACHE_TTL_MS) {
    return parseCache.data;
  }

  const fetchedAt = new Date().toISOString();
  const [curveBook, scheduleBook] = await Promise.all([
    fetchWorkbook(FORECAST_WORKBOOK_URL),
    fetchWorkbook(SCHEDULE_WORKBOOK_URL),
  ]);

  const nominalSheet = curveBook.worksheets[0];
  const realSheet = curveBook.worksheets[1];
  if (!nominalSheet || !realSheet) {
    throw new Error("BOI curve workbook is missing expected sheets");
  }

  const nominalRows = extractSheetRows(nominalSheet, 363)
    .map(parseCurveRow)
    .filter((row): row is ParsedCurveRow => row !== null);
  const realRows = extractSheetRows(realSheet, 363)
    .map(parseCurveRow)
    .filter((row): row is ParsedCurveRow => row !== null);

  const schedule: ParsedScheduleEntry[] = [];
  for (const sheet of scheduleBook.worksheets) {
    for (const cells of extractSheetRows(sheet, 4)) {
      const entry = parseScheduleRow(cells);
      if (entry) schedule.push(entry);
    }
  }

  const data = { nominalRows, realRows, schedule, fetchedAt };
  parseCache = { at: Date.now(), data };
  return data;
}

/**
 * Fetch, parse, and resolve the official forecast curves for one request.
 *
 * The FULL workbook history is parsed server-side; only the latest
 * effective curve plus the explicitly requested historical curves are
 * returned (and thus reach the client). Requested IDs that don't exist are
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
    const { nominalRows, realRows, schedule, fetchedAt: parsedAt } =
      await loadWorkbookRows();

    const effective = selectEffectiveCurves(
      nominalRows,
      realRows,
      schedule,
      new Date(),
      parsedAt,
    ).filter(isValidCurveSnapshot);

    if (effective.length === 0) {
      throw new Error("No valid effective curve rows found in BOI workbook");
    }

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
