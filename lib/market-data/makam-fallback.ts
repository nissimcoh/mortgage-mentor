/**
 * Dated fallback for the official Makam anchor.
 *
 * Frozen from BOI SDMX dataflow BOI.STATISTICS/SECDWH, series
 * DWH_SRC_0351_MA (TSB_BAGR_MAKAM_12M.M — monthly average 12-month Makam
 * yield-to-maturity), observation 2026-06. Used only when the live source
 * is unreachable and always labeled status "fallback".
 */

import type { MakamAnchorSnapshot } from "./mortgage-forecast-types";

export const MAKAM_FALLBACK_VERIFIED_AT = "2026-07-14";

export function createFallbackMakamSnapshot(
  fetchedAt: string,
): MakamAnchorSnapshot {
  return {
    id: "2026-06",
    referenceYear: 2026,
    referenceMonth: 6,
    anchorPercent: 3.2644423268,
    fetchedAt,
    status: "fallback",
    sourceId: "boi-secdwh-makam-12m",
  };
}
