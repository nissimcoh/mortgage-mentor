// CPU-only synthetic history; excludes cache I/O, downloads and XLSX parsing.
// Run: npx vitest bench --run scripts/forecast-selection.bench.ts
import { bench, describe } from "vitest";
import {
  buildForecastCurveHistory, effectiveCurvesAt, isValidCurveSnapshot,
  selectEffectiveCurves, type ParsedCurveRow, type ParsedScheduleEntry,
} from "../lib/market-data/sources/boi-mortgage-forecast-parse";

const rows: ParsedCurveRow[] = [];
const schedule: ParsedScheduleEntry[] = [];
for (let year = 2017; year <= 2026; year++) {
  for (let month = 1; month <= 12; month++) {
    for (const averageType of ["index", "calendar"] as const) {
      rows.push({ referenceYear: year, referenceMonth: month, averageType, yieldsPercent: Array(360).fill(3.5) });
      schedule.push({ referenceYear: year, referenceMonth: month, averageType, publicationDate: `${year}-${String(month).padStart(2, "0")}-${averageType === "index" ? "15" : "28"}` });
    }
  }
}
const cpi = rows.map(row => ({ ...row, indexValues: Array(361).fill(100) }));
const now = new Date("2026-10-16T09:00:00Z");
const fetchedAt = now.toISOString();
const history = buildForecastCurveHistory(rows, rows, schedule, fetchedAt, cpi).filter(isValidCurveSnapshot);

describe("warm forecast selection: 240 synthetic curves", () => {
  bench("previous: join, calendar, sort and validate per request", () => {
    selectEffectiveCurves(rows, rows, schedule, now, fetchedAt, Infinity, cpi).filter(isValidCurveSnapshot);
  });
  bench("prepared history: request-time activation", () => {
    effectiveCurvesAt(history, now);
  });
});
