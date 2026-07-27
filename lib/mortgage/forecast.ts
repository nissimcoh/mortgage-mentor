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

/** Zero yield (annual percent) at a monthly maturity; fails clearly. */
export function zeroYieldAtMonthPercent(
  zeroYieldsPercent: readonly number[],
  maturityMonths: number,
): number {
  if (
    !Number.isInteger(maturityMonths) ||
    maturityMonths < 1 ||
    maturityMonths > zeroYieldsPercent.length
  ) {
    throw new Error(
      `Forecast curve has no yield at maturity ${maturityMonths} months (curve covers 1-${zeroYieldsPercent.length})`,
    );
  }
  return zeroYieldsPercent[maturityMonths - 1];
}

/**
 * Annualized forward anchor between two curve maturities (Directive-451
 * block form):
 *
 *   forward(from, to) =
 *     [ (1+A_to)^(to/12) / (1+A_from)^(from/12) ]^(12/(to−from)) − 1
 *
 * Returned in annual percent.
 */
export function annualizedBlockForwardPercent(
  zeroYieldsPercent: readonly number[],
  fromMonth: number,
  toMonth: number,
): number {
  const from = zeroYieldAtMonthPercent(zeroYieldsPercent, fromMonth) / 100;
  const to = zeroYieldAtMonthPercent(zeroYieldsPercent, toMonth) / 100;
  const factor =
    Math.pow(1 + to, toMonth / 12) / Math.pow(1 + from, fromMonth / 12);
  return (Math.pow(factor, 12 / (toMonth - fromMonth)) - 1) * 100;
}

/**
 * The customer's structural margin for a variable-unlinked track.
 *
 * BASELINE DOCUMENTATION: the current implementation uses A_V — the
 * official nominal zero-curve yield at the reset-period maturity — as the
 * anchor baseline: margin = offeredRate − A_V. This mirrors the
 * Directive-451 bond-anchor construction but has NOT yet been calibrated
 * against a commercial-bank benchmark for this track type.
 */
export function variableAnchorMarginPercent(
  offeredRatePercent: number,
  zeroYieldsPercent: readonly number[],
  resetPeriodMonths: number,
): number {
  return (
    offeredRatePercent -
    zeroYieldAtMonthPercent(zeroYieldsPercent, resetPeriodMonths)
  );
}

export interface BlockForwardRatePathParams {
  months: number;
  /** The annual rate the bank currently offers, percent. */
  currentCustomerRatePercent: number;
  /** V — how often the rate resets, in months (e.g. 12, 24, ..., 120). */
  resetPeriodMonths: number;
  /**
   * The customer's contractual margin over the anchor, percent. The caller
   * derives it from the product's anchor baseline (A_V for government-bond
   * tracks, the official Makam anchor for Makam tracks).
   */
  marginPercent: number;
  /** Official zero spot yields, months 1..360, annual percent. */
  zeroYieldsPercent: readonly number[];
  forecastMode: PrimeForecastMode;
  stressShiftPercent?: number;
}

/**
 * Block-reset customer rate path (percent, index 0 = month 1):
 *
 * - months 1..V use the ACTUAL offered rate (never a forecast);
 * - the block covering months kV+1..(k+1)V uses
 *   forward(kV, (k+1)V) + margin (Directive-451 forwards from the nominal
 *   zero curve);
 * - the rate is constant inside each block; a partial final block keeps
 *   its block rate for the remaining months;
 * - "constant" mode holds the offered rate throughout;
 * - "stress" mode shifts only the FORECAST blocks (the initial offered
 *   period is contractual), with the same no-clamp negative-rate policy
 *   as prime.
 */
export function buildBlockForwardRatePathPercent(
  params: BlockForwardRatePathParams,
): number[] {
  const {
    months,
    currentCustomerRatePercent,
    resetPeriodMonths,
    marginPercent,
    zeroYieldsPercent,
    forecastMode,
    stressShiftPercent = 0,
  } = params;

  if (!Number.isInteger(resetPeriodMonths) || resetPeriodMonths < 1) {
    throw new Error(
      `resetPeriodMonths must be a positive integer, got ${resetPeriodMonths}`,
    );
  }

  if (forecastMode === "constant") {
    return Array.from({ length: months }, () => currentCustomerRatePercent);
  }

  const shift = forecastMode === "stress" ? stressShiftPercent : 0;

  const path: number[] = [];
  for (
    let blockStart = 0;
    blockStart < months;
    blockStart += resetPeriodMonths
  ) {
    const blockRate =
      blockStart === 0
        ? currentCustomerRatePercent
        : annualizedBlockForwardPercent(
            zeroYieldsPercent,
            blockStart,
            blockStart + resetPeriodMonths,
          ) +
          marginPercent +
          shift;
    if (blockRate <= MIN_VALID_ANNUAL_RATE_PERCENT) {
      throw new Error(
        `Forecast rate ${blockRate}% is below the valid bound of ${MIN_VALID_ANNUAL_RATE_PERCENT}%`,
      );
    }
    const blockEnd = Math.min(blockStart + resetPeriodMonths, months);
    for (let month = blockStart; month < blockEnd; month++) {
      path.push(blockRate);
    }
  }
  return path;
}

export interface VariableUnlinkedRatePathParams {
  months: number;
  currentCustomerRatePercent: number;
  resetPeriodMonths: number;
  zeroYieldsPercent: readonly number[];
  forecastMode: PrimeForecastMode;
  stressShiftPercent?: number;
}

/**
 * Government-bond variable-unlinked rate path: the block-forward path with
 * margin = offeredRate − A_V (the documented zero-curve anchor baseline).
 */
export function buildVariableUnlinkedRatePathPercent(
  params: VariableUnlinkedRatePathParams,
): number[] {
  return buildBlockForwardRatePathPercent({
    ...params,
    marginPercent:
      params.forecastMode === "constant"
        ? 0
        : variableAnchorMarginPercent(
            params.currentCustomerRatePercent,
            params.zeroYieldsPercent,
            params.resetPeriodMonths,
          ),
  });
}

export interface CpiIndexFactorsParams {
  months: number;
  /** Cumulative expected CPI index, base 100 at maturity 0, months 0..360. */
  expectedCpiIndexPath: readonly number[];
  forecastMode: PrimeForecastMode;
  /** Parallel ANNUAL inflation shift in percentage points (mode "stress"). */
  inflationStressShiftPercent?: number;
}

/**
 * Monthly CPI indexation factors for a CPI-linked track (index 0 = month 1):
 *
 * - official:  f_t = I[t] / I[t−1]  (so f_1 = I[1]/I[0]);
 * - constant:  f_t = 1  (no inflation);
 * - stress:    official f_t × (1 + shift/100)^(1/12).
 *
 * Deflation is allowed and never clamped, consistent with the negative-rate
 * policy. A stress shift at or below −100% would make the monthly
 * multiplier non-positive and is rejected with a clear error.
 */
export function buildCpiIndexFactors(
  params: CpiIndexFactorsParams,
): number[] {
  const {
    months,
    expectedCpiIndexPath,
    forecastMode,
    inflationStressShiftPercent = 0,
  } = params;

  if (forecastMode === "constant") {
    return Array.from({ length: months }, () => 1);
  }

  if (expectedCpiIndexPath.length < months + 1) {
    throw new Error(
      `Expected CPI index path covers ${expectedCpiIndexPath.length - 1} months but the track needs ${months}`,
    );
  }

  let stressMultiplier = 1;
  if (forecastMode === "stress") {
    if (
      !Number.isFinite(inflationStressShiftPercent) ||
      inflationStressShiftPercent <= -100
    ) {
      throw new Error(
        `Inflation stress shift ${inflationStressShiftPercent}% would make the monthly index multiplier invalid`,
      );
    }
    stressMultiplier = Math.pow(1 + inflationStressShiftPercent / 100, 1 / 12);
  }

  const factors: number[] = [];
  for (let month = 1; month <= months; month++) {
    const current = expectedCpiIndexPath[month];
    const previous = expectedCpiIndexPath[month - 1];
    if (
      !Number.isFinite(current) ||
      !Number.isFinite(previous) ||
      current <= 0 ||
      previous <= 0
    ) {
      throw new Error(
        `Expected CPI index path has an invalid value around month ${month}`,
      );
    }
    factors.push((current / previous) * stressMultiplier);
  }
  return factors;
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
