/**
 * Pure forecast mathematics for Directive-451 prime-track forecasting.
 *
 * Input: the official BOI zero spot yields Z_t (annual percent) at monthly
 * maturities t = 1..360. From them we derive the annualized one-month
 * forward anchors and the customer's forecast rate path.
 *
 * No fetching, no framework imports.
 */

/** Israeli prime = Bank of Israel rate + a fixed 1.5 percentage points. */
export const PRIME_BOI_SPREAD_PERCENT = 1.5;

export type PrimeForecastMode = "official" | "constant" | "stress";

export const PRIME_FORECAST_MODES: readonly PrimeForecastMode[] = [
  "official",
  "constant",
  "stress",
];

export function isPrimeForecastMode(
  value: string | null | undefined,
): value is PrimeForecastMode {
  return (PRIME_FORECAST_MODES as readonly string[]).includes(value ?? "");
}

/**
 * Annualized one-month forward anchors from zero spot yields.
 *
 *   forward(1) = Z_1
 *   forward(t) = [ (1+Z_t)^(t/12) / (1+Z_{t-1})^((t-1)/12) ]^12 − 1,  t ≥ 2
 *
 * `zeroYieldsPercent[i]` is Z_{i+1} in annual percent; the result uses the
 * same indexing (index i = month i+1) and unit.
 */
export function annualizedMonthlyForwardsPercent(
  zeroYieldsPercent: readonly number[],
): number[] {
  return zeroYieldsPercent.map((zt, index) => {
    if (index === 0) return zt;
    const current = Math.pow(1 + zt / 100, (index + 1) / 12);
    const previous = Math.pow(
      1 + zeroYieldsPercent[index - 1] / 100,
      index / 12,
    );
    return (Math.pow(current / previous, 12) - 1) * 100;
  });
}

export interface PrimeRatePathParams {
  months: number;
  /** The customer's current/offered annual rate in percent. */
  currentCustomerRatePercent: number;
  /** The current Bank of Israel rate in percent (never hardcoded here). */
  currentBankOfIsraelRatePercent: number;
  /** Official zero spot yields, months 1..360, annual percent. */
  zeroYieldsPercent: readonly number[];
  forecastMode: PrimeForecastMode;
  /** Parallel shift in percentage points, used by mode "stress". */
  stressShiftPercent?: number;
}

/**
 * Annual rates at or below this bound are mathematically meaningless for a
 * monthly amortization ((1 + i) would reach 0), so the engine rejects the
 * scenario instead of producing garbage. This is a domain constraint, not
 * an economic floor.
 */
export const MIN_VALID_ANNUAL_RATE_PERCENT = -1200;

/**
 * The customer's forecast annual rate for each month (percent, index 0 =
 * month 1):
 *
 *   margin      = customerRate − (boiRate + 1.5)
 *   rate_t      = forwardAnchor_t + 1.5 + margin      (mode "official")
 *   rate_t      = customerRate                        (mode "constant")
 *   rate_t      = official rate_t + stressShift       (mode "stress")
 *
 * Negative forecast rates are allowed and flow through the schedule math
 * unchanged — no directive mandates a 0% floor, so none is applied. Only
 * scenarios beyond {@link MIN_VALID_ANNUAL_RATE_PERCENT} (where the monthly
 * factor 1+i would hit 0) are rejected, with a clear error.
 */
export function buildPrimeRatePathPercent(
  params: PrimeRatePathParams,
): number[] {
  const {
    months,
    currentCustomerRatePercent,
    currentBankOfIsraelRatePercent,
    zeroYieldsPercent,
    forecastMode,
    stressShiftPercent = 0,
  } = params;

  if (forecastMode === "constant") {
    return Array.from({ length: months }, () => currentCustomerRatePercent);
  }

  if (zeroYieldsPercent.length < months) {
    throw new Error(
      `Forecast curve covers ${zeroYieldsPercent.length} months but the track needs ${months}`,
    );
  }

  const margin =
    currentCustomerRatePercent -
    (currentBankOfIsraelRatePercent + PRIME_BOI_SPREAD_PERCENT);
  const shift = forecastMode === "stress" ? stressShiftPercent : 0;
  const forwards = annualizedMonthlyForwardsPercent(
    zeroYieldsPercent.slice(0, months),
  );

  const path = forwards.map(
    (forward) => forward + PRIME_BOI_SPREAD_PERCENT + margin + shift,
  );
  for (const rate of path) {
    if (rate <= MIN_VALID_ANNUAL_RATE_PERCENT) {
      throw new Error(
        `Forecast rate ${rate}% is below the valid bound of ${MIN_VALID_ANNUAL_RATE_PERCENT}%`,
      );
    }
  }
  return path;
}

/**
 * Monthly internal rate of return of (−loanAmount, payments...), solved by
 * bisection. Returns the MONTHLY rate as a fraction; annualize with
 * ((1+irr)^12 − 1) × 100. The search range admits negative IRRs so
 * negative-rate scenarios report honestly.
 */
export function solveMonthlyIrr(
  loanAmount: number,
  payments: readonly number[],
): number {
  let low = -0.05;
  let high = 0.05;
  for (let iteration = 0; iteration < 200; iteration++) {
    const mid = (low + high) / 2;
    let presentValue = 0;
    for (let index = 0; index < payments.length; index++) {
      presentValue += payments[index] / Math.pow(1 + mid, index + 1);
    }
    if (presentValue > loanAmount) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}
