import { dailyServerCache } from "../daily-server-cache";
/**
 * Central Bureau of Statistics (הלמ״ס) adapter.
 *
 * Official source: the CBS index API, series 120010
 * ("מדד המחירים לצרכן - כללי" — the general Consumer Price Index).
 *
 * The parser is pure and exported for unit tests; only `fetchLatestCpi`
 * touches the network and it must be called from server code only.
 */

import { fetchCurrent } from "./fetch-current";
import type { FetchedCpi } from "../derive";

export const CBS_CPI_SERIES_ID = 120010;

// last=2 gives a small safety margin; the parser picks the newest month.
export const CBS_CPI_URL = `https://api.cbs.gov.il/index/data/price?id=${CBS_CPI_SERIES_ID}&format=json&last=2`;

interface CbsDateEntry {
  year?: unknown;
  month?: unknown;
  percent?: unknown;
  currBase?: { value?: unknown } | null;
}

/**
 * Parse the CBS index API response for the general CPI series and return
 * the newest month's figures. Order in the response is not assumed.
 */
export function parseCbsCpiResponse(payload: unknown): FetchedCpi {
  const series = (
    payload as { month?: Array<{ code?: unknown; date?: unknown }> } | null
  )?.month?.[0];
  if (!series || series.code !== CBS_CPI_SERIES_ID) {
    throw new Error("CBS CPI response had an unexpected shape or series code");
  }

  const dates = series.date;
  if (!Array.isArray(dates) || dates.length === 0) {
    throw new Error("CBS CPI response contained no observations");
  }

  let latest: FetchedCpi | null = null;
  for (const entry of dates as CbsDateEntry[]) {
    const year = entry.year;
    const month = entry.month;
    const percent = entry.percent;
    const indexValue = entry.currBase?.value;
    if (
      typeof year !== "number" || !Number.isInteger(year) ||
      typeof month !== "number" || !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      typeof percent !== "number" || !Number.isFinite(percent) ||
      typeof indexValue !== "number" || !Number.isFinite(indexValue) || indexValue <= 0
    ) {
      continue;
    }
    if (
      latest === null ||
      year > latest.referenceYear ||
      (year === latest.referenceYear && month > latest.referenceMonth)
    ) {
      latest = {
        referenceYear: year,
        referenceMonth: month,
        monthlyChangePercent: percent,
        indexValue,
      };
    }
  }

  if (latest === null) {
    throw new Error("CBS CPI response contained no valid observations");
  }
  return latest;
}

const readDaily = dailyServerCache("cbs-cpi", () =>
  fetchCurrent(CBS_CPI_URL, async (response) => parseCbsCpiResponse(await response.json())),
);

/** Serve the daily server snapshot, retaining its actual source check time. */
export async function fetchLatestCpi(): Promise<FetchedCpi> {
  const cached = await readDaily();
  return { ...cached.value, fetchedAt: cached.fetchedAt };
}
