/** Shared status-label mapping for the data-sources freshness display. */

export type FreshnessStatus = "live" | "fallback";

export interface FreshnessStatusLabels {
  freshnessStatusLive: string;
  freshnessStatusFallback: string;
}

/** Maps a source's live/fallback status to its display text. Fallback data
 * is never mapped to the "live" label, regardless of dictionary content. */
export function freshnessStatusText(
  status: FreshnessStatus,
  labels: FreshnessStatusLabels,
): string {
  return status === "live"
    ? labels.freshnessStatusLive
    : labels.freshnessStatusFallback;
}
