/**
 * Interest-rate conversion helpers.
 *
 * Pure functions, no framework imports.
 */

import type { InterestRateInputMode } from "./types";

export const MONTHS_PER_YEAR = 12;

/**
 * Convert a quoted annual rate (in percent) to a monthly rate (as a
 * fraction), according to how the quote should be interpreted.
 *
 * - "nominalAnnual" (ריבית נומינלית): the standard Israeli bank quote.
 *   The annual number is simply twelve times the monthly rate, so
 *   monthlyRate = annualRate / 12. Compounding the result for 12 months
 *   yields an effective annual rate slightly HIGHER than the quote.
 *
 * - "effectiveAnnual" (ריבית אפקטיבית/מתואמת): the annual number already
 *   accounts for monthly compounding, so the monthly rate is the 12th root:
 *   monthlyRate = (1 + annualRate)^(1/12) - 1.
 *
 * Example, 4.8% annual:
 * - nominalAnnual   → 0.048 / 12          = 0.004000  (0.4000%/month)
 * - effectiveAnnual → 1.048^(1/12) - 1    ≈ 0.003915  (0.3915%/month)
 */
export function annualPercentToMonthlyRate(
  annualInterestRatePercent: number,
  mode: InterestRateInputMode,
): number {
  if (!Number.isFinite(annualInterestRatePercent)) {
    throw new Error(
      `annualInterestRatePercent must be a finite number, got ${annualInterestRatePercent}`,
    );
  }
  if (annualInterestRatePercent < 0) {
    throw new Error(
      `annualInterestRatePercent cannot be negative, got ${annualInterestRatePercent}`,
    );
  }

  const annualRate = annualInterestRatePercent / 100;

  switch (mode) {
    case "nominalAnnual":
      return annualRate / MONTHS_PER_YEAR;
    case "effectiveAnnual":
      return Math.pow(1 + annualRate, 1 / MONTHS_PER_YEAR) - 1;
    default: {
      const unsupported: never = mode;
      throw new Error(`Unsupported interest rate input mode: ${unsupported}`);
    }
  }
}

/**
 * Convert a bank-quoted nominal annual percent into the effective annual
 * percent actually paid once monthly compounding is taken into account:
 *
 *   ((1 + rate / 100 / 12)^12 - 1) * 100
 *
 * E.g. 4.8% nominal → ~4.91% effective. The calculator UI shows this as
 * educational information next to the results.
 */
export function nominalAnnualPercentToEffectiveAnnualPercent(
  annualInterestRatePercent: number,
): number {
  const monthlyRate = annualPercentToMonthlyRate(
    annualInterestRatePercent,
    "nominalAnnual",
  );
  return (Math.pow(1 + monthlyRate, MONTHS_PER_YEAR) - 1) * 100;
}
