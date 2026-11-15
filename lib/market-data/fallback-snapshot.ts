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

/** The date these values were last verified against the official sources. */
export const FALLBACK_VERIFIED_AT = "2026-11-15";

export const FALLBACK_BOI_RATE = {
  ratePercent: 3.25,
  /** Decision of 2026-09-01, in effect from 2026-09-03. */
  effectiveDate: "2026-09-03",
} as const;

/**
 * Published schedule of Bank of Israel interest decisions, announced at
 * 16:00 Israel time. There is no machine-readable feed, so the dates are
 * copied from the official pages (read 2026-11-15):
 * https://www.boi.org.il/roles/monetary-policy/interest-rate-dates/
 * https://www.boi.org.il/bank-of-israel/2027-2028-interest-rate-dates/
 * The Bank may move a date with advance notice. Extend the list when the
 * next schedule is published; once every date has passed, the "next
 * decision" line is simply not shown.
 */
export const FALLBACK_DECISION_DATES: readonly string[] = [
  "2026-09-01T16:00:00+03:00",
  "2026-10-21T16:00:00+03:00",
  "2026-11-23T16:00:00+02:00",
  "2027-01-04T16:00:00+02:00",
  "2027-02-22T16:00:00+02:00",
  "2027-04-05T16:00:00+03:00",
  "2027-05-24T16:00:00+03:00",
  "2027-07-05T16:00:00+03:00",
  "2027-08-18T16:00:00+03:00",
  "2027-09-27T16:00:00+03:00",
  "2027-11-22T16:00:00+02:00",
  "2028-01-03T16:00:00+02:00",
  "2028-02-21T16:00:00+02:00",
  "2028-04-03T16:00:00+03:00",
];

export const FALLBACK_CPI = {
  referenceYear: 2026,
  referenceMonth: 9, // September 2026
  monthlyChangePercent: -0.5,
  indexValue: 105.3,
} as const;

/**
 * Bank of Israel Research Department staff forecast. Published as a
 * document (no machine-readable series identified yet). Not shown anywhere
 * in the app and not re-verified on 2026-11-15.
 */
export const FALLBACK_INFLATION_FORECAST = {
  percent: 1.8,
  horizonEndYear: 2027,
  horizonEndQuarter: 2, // the four quarters ending Q2 2027
} as const;
