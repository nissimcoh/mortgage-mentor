/**
 * Server-only fetch half of the official Makam-anchor adapter. Downloads
 * the key-filtered SDMX CSV for the monthly 12-month Makam series and
 * delegates parsing/resolution to the pure module.
 */

import "server-only";

import type { MakamAnchorData } from "../mortgage-forecast-types";
import { createFallbackMakamSnapshot } from "../makam-fallback";
import {
  MAKAM_SERIES_KEY,
  MAKAM_SOURCE_ID,
  parseMakamCsv,
  pickMakamSnapshotsForRequest,
} from "./boi-makam-parse";

// Key-filtered to the single monthly series; 24 months of history covers
// realistic snapshot pinning for shared links.
export const MAKAM_SERIES_URL = `https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/SECDWH/1.0/${MAKAM_SERIES_KEY}?lastNObservations=24&format=csv`;

/**
 * Fetch and resolve the official Makam anchor snapshots for one request.
 * Never throws: on failure it returns the dated bundled fallback with
 * status "fallback" and a sanitized error list.
 */
export async function getMakamAnchorData(
  requestedSnapshotIds: readonly string[] = [],
): Promise<MakamAnchorData> {
  const fetchedAt = new Date().toISOString();
  try {
    const response = await fetch(MAKAM_SERIES_URL, {
      next: { revalidate: 21600 }, // ~6h: the series updates monthly
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) {
      throw new Error(`BOI SECDWH API responded with status ${response.status}`);
    }

    const available = parseMakamCsv(await response.text(), fetchedAt);
    const { snapshots, missingSnapshotIds } = pickMakamSnapshotsForRequest(
      available,
      requestedSnapshotIds,
    );
    return { snapshots, missingSnapshotIds, status: "live", errors: [] };
  } catch (reason) {
    const message =
      reason instanceof Error ? reason.message : "Unknown source error";
    const fallback = createFallbackMakamSnapshot(fetchedAt);
    const { snapshots, missingSnapshotIds } = pickMakamSnapshotsForRequest(
      [fallback],
      requestedSnapshotIds,
    );
    return {
      snapshots,
      missingSnapshotIds,
      status: "fallback",
      errors: [{ sourceId: MAKAM_SOURCE_ID, message }],
    };
  }
}
