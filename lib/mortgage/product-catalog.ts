/**
 * Beginner-facing Israeli mortgage product catalog.
 *
 * Pure module, no framework imports. The exact reset-frequency and
 * loan-term option lists live here (not in UI components) so they can
 * later become bank-specific without touching the rest of the app.
 */

/** Reset frequencies offered for the government-bond variable product. */
export const GOVERNMENT_BOND_RESET_MONTHS = [24, 30, 36, 60, 84, 120] as const;
export type GovernmentBondResetMonths =
  (typeof GOVERNMENT_BOND_RESET_MONTHS)[number];

export function isGovernmentBondResetMonths(
  value: number,
): value is GovernmentBondResetMonths {
  return (GOVERNMENT_BOND_RESET_MONTHS as readonly number[]).includes(value);
}

/**
 * Exact user-facing loan-term options (in years) per reset frequency.
 * Half-year values exist ONLY for the 30-month product.
 */
export const GOVERNMENT_BOND_TERM_YEARS: Record<
  GovernmentBondResetMonths,
  readonly number[]
> = {
  24: [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30],
  30: [5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5, 30],
  36: [6, 9, 12, 15, 18, 21, 24, 27, 30],
  60: [10, 15, 20, 25, 30],
  84: [14, 21, 28],
  120: [20, 30],
};

/**
 * Annual-Makam product terms: whole years 4-30. Default pending official
 * verification of the exact bank range; tighten here when verified.
 */
export const MAKAM_TERM_YEARS: readonly number[] = Array.from(
  { length: 27 },
  (_, index) => index + 4,
);

/** True when `years` is an exact option for the given reset frequency. */
export function isGovernmentBondTermValid(
  resetPeriodMonths: GovernmentBondResetMonths,
  years: number,
): boolean {
  return GOVERNMENT_BOND_TERM_YEARS[resetPeriodMonths].includes(years);
}

export function isMakamTermValid(years: number): boolean {
  return MAKAM_TERM_YEARS.includes(years);
}

/**
 * Convert a user-facing years value to whole payment months. The UI only
 * ever shows years (including x.5 where the catalog permits); the engine
 * only ever receives an integral month count.
 */
export function termMonthsFromYears(years: number): number {
  const months = years * 12;
  if (!Number.isFinite(months) || Math.abs(months - Math.round(months)) > 1e-9) {
    throw new Error(
      `Loan term of ${years} years does not convert to a whole number of months`,
    );
  }
  const rounded = Math.round(months);
  if (rounded < 1) {
    throw new Error(`Loan term must be at least one month, got ${years} years`);
  }
  return rounded;
}

export interface PaymentMonthParts {
  month: number;
  /** 1-based loan year: month 1 → year 1, month 13 → year 2. */
  year: number;
  /** 1-based month within that year: month 12 → 12, month 13 → 1. */
  monthOfYear: number;
}

/**
 * Centralized month → (year, month-of-year) breakdown for displaying when
 * a payment occurs, e.g. month 255 → year 21, month 3.
 */
export function paymentMonthParts(month: number): PaymentMonthParts {
  if (!Number.isInteger(month) || month < 1) {
    throw new Error(`Payment month must be a positive integer, got ${month}`);
  }
  return {
    month,
    year: Math.floor((month - 1) / 12) + 1,
    monthOfYear: ((month - 1) % 12) + 1,
  };
}
