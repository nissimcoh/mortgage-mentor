/**
 * Human-verified fallback values, used when official sources are
 * unreachable and for data that has no machine-readable series yet
 * (decision schedule, staff inflation forecast).
 *
 * IMPORTANT: these values are only as good as their verification date.
 * The UI must always show `FALLBACK_VERIFIED_AT` next to fallback values
 * and must never present them as live data. Update this file whenever the
 * values are re-verified against the official sources.
 */

/** The date these values were last verified by a human. */
export const FALLBACK_VERIFIED_AT = "2026-07-06";

export const FALLBACK_BOI_RATE = {
  ratePercent: 3.5,
  /** Decision of 2026-07-06 (the verification date). */
  effectiveDate: "2026-07-06",
} as const;

/**
 * Published schedule of upcoming Bank of Israel interest decisions.
 * There is no machine-readable feed for this yet, so keep the next known
 * dates here (Israel time).
 */
export const FALLBACK_DECISION_DATES: readonly string[] = [
  "2026-09-01T16:00:00+03:00",
];

export const FALLBACK_CPI = {
  referenceYear: 2026,
  referenceMonth: 5, // May 2026
  monthlyChangePercent: -0.3,
  indexValue: 104.8,
} as const;

/**
 * Bank of Israel Research Department staff forecast. Published as a
 * document (no machine-readable series identified yet).
 */
export const FALLBACK_INFLATION_FORECAST = {
  percent: 1.8,
  horizonEndYear: 2027,
  horizonEndQuarter: 2, // the four quarters ending Q2 2027
} as const;
