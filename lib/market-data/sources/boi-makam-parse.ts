/**
 * Pure half of the official Makam-anchor adapter: CSV parsing and
 * request-scoped snapshot resolution. No fetching — fully unit-testable.
 * The server-only fetch lives in ./boi-makam.ts.
 *
 * Official source: BOI SDMX dataflow BOI.STATISTICS/SECDWH, series key
 * DWH_SRC_0351_MA (ORIGINAL_CODE TSB_BAGR_MAKAM_12M.M) — the monthly
 * average 12-month Makam yield-to-maturity, the standard bank עוגן מק"מ
 * basis.
 */

import type { MakamAnchorSnapshot } from "../mortgage-forecast-types";

export const MAKAM_SOURCE_ID = "boi-secdwh-makam-12m";
export const MAKAM_SERIES_KEY = "DWH_SRC_0351_MA";
export const MAKAM_ORIGINAL_CODE = "TSB_BAGR_MAKAM_12M.M";

/**
 * Parse the SDMX CSV export of the monthly Makam series into snapshots,
 * newest first. Columns are located by header name (the SECDWH layout has
 * many dimensions and may evolve).
 */
export function parseMakamCsv(
  csv: string,
  fetchedAt: string,
): MakamAnchorSnapshot[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error("Makam CSV contained no data rows");
  }

  const header = lines[0].split(",");
  const seriesIndex = header.indexOf("SERIES_CODE");
  const timeIndex = header.indexOf("TIME_PERIOD");
  const valueIndex = header.indexOf("OBS_VALUE");
  if (timeIndex === -1 || valueIndex === -1) {
    throw new Error("Makam CSV had an unexpected header");
  }

  const snapshots: MakamAnchorSnapshot[] = [];
  for (const line of lines.slice(1)) {
    const columns = line.split(",");
    if (seriesIndex !== -1 && columns[seriesIndex] !== MAKAM_SERIES_KEY) {
      continue;
    }
    const period = columns[timeIndex];
    const rawValue = columns[valueIndex];
    // Pending months appear with an empty OBS_VALUE; Number("") is 0, so
    // an explicit emptiness check is required to skip them.
    if (rawValue === undefined || rawValue.trim() === "") continue;
    const value = Number(rawValue);
    const match = /^(\d{4})-(\d{2})$/.exec(period ?? "");
    if (!match || !Number.isFinite(value)) continue;

    snapshots.push({
      id: period,
      referenceYear: Number(match[1]),
      referenceMonth: Number(match[2]),
      anchorPercent: value,
      fetchedAt,
      status: "live",
      sourceId: MAKAM_SOURCE_ID,
    });
  }

  if (snapshots.length === 0) {
    throw new Error("Makam CSV contained no valid observations");
  }

  snapshots.sort((a, b) => b.id.localeCompare(a.id));
  return snapshots;
}

export interface MakamRequestResolution {
  snapshots: MakamAnchorSnapshot[];
  missingSnapshotIds: string[];
}

/**
 * Resolve explicitly pinned snapshot IDs. Unknown IDs are reported, never
 * silently replaced with the latest month.
 */
export function pickMakamSnapshotsForRequest(
  available: MakamAnchorSnapshot[],
  requestedIds: readonly string[],
): MakamRequestResolution {
  const snapshots = available.length > 0 ? [available[0]] : [];
  const missingSnapshotIds: string[] = [];

  for (const id of new Set(requestedIds)) {
    if (id === "") continue;
    const found = available.find((snapshot) => snapshot.id === id);
    if (!found) {
      missingSnapshotIds.push(id);
    } else if (!snapshots.some((snapshot) => snapshot.id === id)) {
      snapshots.push(found);
    }
  }

  return { snapshots, missingSnapshotIds };
}
