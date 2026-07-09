/**
 * Bank of Israel adapter.
 *
 * Official source: the BOI statistical SDMX API,
 * dataflow BOI.STATISTICS/BR ("BOI interest rate"),
 * series MNT_RIB_BOI_D (daily BOI rate, percent).
 *
 * The parser is pure and exported for unit tests; only `fetchBoiRate`
 * touches the network and it must be called from server code only.
 */

import type { FetchedBoiRate } from "../derive";

// Daily series; ~60 observations comfortably cover the current value run
// so the effective date (start of the run) can be derived.
export const BOI_RATE_SERIES_URL =
  "https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/BR/1.0/MNT_RIB_BOI_D.D.RIB_BOI?lastNObservations=60&format=csv";

export const BOI_RATE_SERIES_CODE = "MNT_RIB_BOI_D";

/**
 * Parse the SDMX CSV export of the daily BOI rate series.
 *
 * Returns the latest rate, the date of the newest observation, and the
 * effective date — the first day of the newest run of identical values
 * (i.e. when the current rate took effect).
 */
export function parseBoiRateCsv(csv: string): FetchedBoiRate {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error("BOI rate CSV contained no data rows");
  }

  const header = lines[0].split(",");
  const seriesIndex = header.indexOf("SERIES_CODE");
  const timeIndex = header.indexOf("TIME_PERIOD");
  const valueIndex = header.indexOf("OBS_VALUE");
  if (timeIndex === -1 || valueIndex === -1) {
    throw new Error("BOI rate CSV had an unexpected header");
  }

  const observations = lines
    .slice(1)
    .map((line) => line.split(","))
    .filter(
      (columns) =>
        seriesIndex === -1 || columns[seriesIndex] === BOI_RATE_SERIES_CODE,
    )
    .map((columns) => ({
      date: columns[timeIndex],
      value: Number(columns[valueIndex]),
    }))
    .filter(
      (observation) =>
        /^\d{4}-\d{2}-\d{2}$/.test(observation.date) &&
        Number.isFinite(observation.value),
    )
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  if (observations.length === 0) {
    throw new Error("BOI rate CSV contained no valid observations");
  }

  const latest = observations[observations.length - 1];
  let effectiveDate = latest.date;
  for (let index = observations.length - 1; index >= 0; index--) {
    if (observations[index].value !== latest.value) break;
    effectiveDate = observations[index].date;
  }

  return {
    ratePercent: latest.value,
    effectiveDate,
    lastObservationDate: latest.date,
  };
}

/** Server-side fetch of the current BOI rate. Cached for an hour. */
export async function fetchBoiRate(): Promise<FetchedBoiRate> {
  const response = await fetch(BOI_RATE_SERIES_URL, {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`BOI SDMX API responded with status ${response.status}`);
  }
  return parseBoiRateCsv(await response.text());
}
