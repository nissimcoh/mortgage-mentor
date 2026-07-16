/**
 * Public calculation API of the mortgage engine.
 *
 * This is a monthly simulation model: one payment per month, constant rate
 * per track, no fees. Exact bank figures may additionally involve day-count
 * conventions, actual payment dates, CPI publication dates and linkage
 * mechanics, and contract-specific rules — deliberately out of scope for
 * this first version.
 *
 * Currently implemented: fixedUnlinked (קל"צ) with Spitzer repayment.
 * CPI-linked, prime, variable, eligibility, balloon, grace and
 * equal-principal inputs are already expressible in the types, and calling
 * them throws a clear "not implemented" error rather than a wrong number.
 */

import {
  DEFAULT_INTEREST_RATE_INPUT_MODE,
  type AmortizationEntry,
  type FixedUnlinkedTrackInput,
  type MortgageScenarioInput,
  type MortgageTrackInput,
  type PrimeTrackInput,
  type ScenarioSummary,
  type SpitzerPaymentParams,
  type TrackSummary,
  type VariableGovernmentBondTrackInput,
  type VariableMakamTrackInput,
} from "./types";
import { annualPercentToMonthlyRate, MONTHS_PER_YEAR } from "./interest";
import {
  buildBlockRepricedSpitzerSchedule,
  buildEqualPrincipalSchedule,
  buildSpitzerSchedule,
  buildVariableRateEqualPrincipalSchedule,
  buildVariableRateSpitzerSchedule,
  roundMoney,
  spitzerMonthlyPaymentRaw,
} from "./amortization";
import {
  buildBlockForwardRatePathPercent,
  buildPrimeRatePathPercent,
  PRIME_BOI_SPREAD_PERCENT,
  solveMonthlyIrr,
  variableAnchorMarginPercent,
} from "./forecast";
import {
  isGovernmentBondResetMonths,
  termMonthsFromYears,
} from "./product-catalog";

function assertValidLoanTerms({
  loanAmount,
  annualInterestRatePercent,
  years,
}: SpitzerPaymentParams): void {
  if (!Number.isFinite(loanAmount) || loanAmount <= 0) {
    throw new Error(`loanAmount must be positive, got ${loanAmount}`);
  }
  if (!Number.isFinite(years) || years <= 0) {
    throw new Error(`years must be positive, got ${years}`);
  }
  if (
    !Number.isFinite(annualInterestRatePercent) ||
    annualInterestRatePercent < 0
  ) {
    throw new Error(
      `annualInterestRatePercent cannot be negative, got ${annualInterestRatePercent}`,
    );
  }
}

/** Fractional years are rounded to whole months; must be at least 1. */
function toNumberOfPayments(years: number): number {
  const numberOfPayments = Math.round(years * MONTHS_PER_YEAR);
  if (numberOfPayments < 1) {
    throw new Error(`years is too small to produce a monthly schedule: ${years}`);
  }
  return numberOfPayments;
}

/** The constant Spitzer monthly payment, rounded to agorot. */
export function calculateMonthlyPaymentForSpitzer(
  params: SpitzerPaymentParams,
): number {
  assertValidLoanTerms(params);
  return roundMoney(
    spitzerMonthlyPaymentRaw({
      loanAmount: params.loanAmount,
      monthlyRate: annualPercentToMonthlyRate(
        params.annualInterestRatePercent,
        params.interestRateInputMode ?? DEFAULT_INTEREST_RATE_INPUT_MODE,
      ),
      numberOfPayments: toNumberOfPayments(params.years),
    }),
  );
}

/** Stamp the quoted annual rate onto every row of a fixed-rate schedule. */
function stampAnnualRate(
  schedule: AmortizationEntry[],
  annualRatePercent: number,
): AmortizationEntry[] {
  return schedule.map((entry) => ({
    ...entry,
    activeAnnualRatePercent: annualRatePercent,
  }));
}

/** Full month-by-month Spitzer schedule, ending at a zero balance. */
export function generateSpitzerSchedule(
  params: SpitzerPaymentParams,
): AmortizationEntry[] {
  assertValidLoanTerms(params);
  return stampAnnualRate(
    buildSpitzerSchedule({
      loanAmount: params.loanAmount,
      monthlyRate: annualPercentToMonthlyRate(
        params.annualInterestRatePercent,
        params.interestRateInputMode ?? DEFAULT_INTEREST_RATE_INPUT_MODE,
      ),
      numberOfPayments: toNumberOfPayments(params.years),
    }),
    params.annualInterestRatePercent,
  );
}

/**
 * Payment statistics derived from an (already rounded) schedule, so that
 * summaries always agree with the table a user would see.
 */
function summarizePayments(schedule: AmortizationEntry[]) {
  let totalPayment = 0;
  let maximumPayment = -Infinity;
  // When a rounded maximum repeats across months, the FIRST month wins.
  let maximumMonth = 1;
  let minimumPayment = Infinity;
  for (const entry of schedule) {
    totalPayment += entry.payment;
    if (entry.payment > maximumPayment) {
      maximumPayment = entry.payment;
      maximumMonth = entry.month;
    }
    if (entry.payment < minimumPayment) minimumPayment = entry.payment;
  }
  return {
    totalPayment: roundMoney(totalPayment),
    firstPayment: schedule[0].payment,
    lastPayment: schedule[schedule.length - 1].payment,
    maximumPayment,
    maximumMonth,
    minimumPayment,
    finalBalance: schedule[schedule.length - 1].remainingBalance,
  };
}

/** Build a fixed-unlinked track's schedule, dispatching on repayment method. */
function buildFixedTrackSchedule(
  track: FixedUnlinkedTrackInput,
): AmortizationEntry[] {
  assertValidLoanTerms(track);
  const params = {
    loanAmount: track.loanAmount,
    monthlyRate: annualPercentToMonthlyRate(
      track.annualInterestRatePercent,
      track.interestRateInputMode ?? DEFAULT_INTEREST_RATE_INPUT_MODE,
    ),
    numberOfPayments: toNumberOfPayments(track.years),
  };

  switch (track.repaymentMethod) {
    case "spitzer":
      return stampAnnualRate(
        buildSpitzerSchedule(params),
        track.annualInterestRatePercent,
      );
    case "equalPrincipal":
      return stampAnnualRate(
        buildEqualPrincipalSchedule(params),
        track.annualInterestRatePercent,
      );
    default:
      throw new Error(
        `Repayment method "${track.repaymentMethod}" is not implemented yet; only "spitzer" and "equalPrincipal" are supported so far`,
      );
  }
}

function assertValidPrimeTrack(track: PrimeTrackInput): void {
  if (!Number.isFinite(track.loanAmount) || track.loanAmount <= 0) {
    throw new Error(`loanAmount must be positive, got ${track.loanAmount}`);
  }
  if (!Number.isFinite(track.years) || track.years <= 0) {
    throw new Error(`years must be positive, got ${track.years}`);
  }
  if (
    !Number.isFinite(track.currentCustomerRatePercent) ||
    track.currentCustomerRatePercent < 0
  ) {
    throw new Error(
      `currentCustomerRatePercent cannot be negative, got ${track.currentCustomerRatePercent}`,
    );
  }
  if (
    !Number.isFinite(track.currentBankOfIsraelRatePercent) ||
    track.currentBankOfIsraelRatePercent < 0
  ) {
    throw new Error(
      `currentBankOfIsraelRatePercent cannot be negative, got ${track.currentBankOfIsraelRatePercent}`,
    );
  }
  if (
    track.stressShiftPercent !== undefined &&
    !Number.isFinite(track.stressShiftPercent)
  ) {
    throw new Error(
      `stressShiftPercent must be a finite number, got ${track.stressShiftPercent}`,
    );
  }
}

function buildVariableSchedule(
  repaymentMethod: PrimeTrackInput["repaymentMethod"],
  loanAmount: number,
  annualRatePercentPath: readonly number[],
  numberOfPayments: number,
): AmortizationEntry[] {
  const params = { loanAmount, annualRatePercentPath, numberOfPayments };
  switch (repaymentMethod) {
    case "spitzer":
      return buildVariableRateSpitzerSchedule(params);
    case "equalPrincipal":
      return buildVariableRateEqualPrincipalSchedule(params);
    default:
      throw new Error(
        `Repayment method "${repaymentMethod}" is not implemented yet; only "spitzer" and "equalPrincipal" are supported so far`,
      );
  }
}

function calculatePrimeTrackSummary(track: PrimeTrackInput): TrackSummary {
  assertValidPrimeTrack(track);
  const numberOfPayments = toNumberOfPayments(track.years);

  const forecastPath = buildPrimeRatePathPercent({
    months: numberOfPayments,
    currentCustomerRatePercent: track.currentCustomerRatePercent,
    currentBankOfIsraelRatePercent: track.currentBankOfIsraelRatePercent,
    zeroYieldsPercent: track.forecastZeroYieldsPercent,
    forecastMode: track.forecastMode,
    stressShiftPercent: track.stressShiftPercent,
  });
  const schedule = buildVariableSchedule(
    track.repaymentMethod,
    track.loanAmount,
    forecastPath,
    numberOfPayments,
  );

  // The user-visible "current" first payment: ordinary schedule at the
  // currently offered rate over the full original term.
  const currentPath = Array.from(
    { length: numberOfPayments },
    () => track.currentCustomerRatePercent,
  );
  const currentFirstPayment = buildVariableSchedule(
    track.repaymentMethod,
    track.loanAmount,
    currentPath,
    numberOfPayments,
  )[0].payment;

  const payments = summarizePayments(schedule);
  const monthlyIrr = solveMonthlyIrr(
    track.loanAmount,
    schedule.map((entry) => entry.payment),
  );

  return {
    monthlyPayment: payments.firstPayment,
    totalPayment: payments.totalPayment,
    totalInterest: roundMoney(payments.totalPayment - track.loanAmount),
    numberOfPayments: schedule.length,
    finalBalance: payments.finalBalance,
    firstPayment: payments.firstPayment,
    lastPayment: payments.lastPayment,
    maximumPayment: payments.maximumPayment,
    minimumPayment: payments.minimumPayment,
    schedule,
    forecast: {
      currentFirstPayment,
      forecastFirstPayment: payments.firstPayment,
      forecastMaximumPayment: payments.maximumPayment,
      monthOfForecastMaximumPayment: payments.maximumMonth,
      forecastLastPayment: payments.lastPayment,
      forecastTotalPayment: payments.totalPayment,
      forecastTotalInterest: roundMoney(
        payments.totalPayment - track.loanAmount,
      ),
      forecastOverallRatePercent:
        (Math.pow(1 + monthlyIrr, 12) - 1) * 100,
      customerPrimeMarginPercent:
        track.currentCustomerRatePercent -
        (track.currentBankOfIsraelRatePercent + PRIME_BOI_SPREAD_PERCENT),
      currentPrimeRatePercent:
        track.currentBankOfIsraelRatePercent + PRIME_BOI_SPREAD_PERCENT,
      forecastMode: track.forecastMode,
      stressShiftPercent: track.stressShiftPercent ?? 0,
      forecastCurveId: track.forecastCurveId ?? null,
      forecastCurvePublicationDate: track.forecastCurvePublicationDate ?? null,
    },
  };
}

function assertValidVariableTrackCore(track: {
  loanAmount: number;
  years: number;
  currentCustomerRatePercent: number;
  resetPeriodMonths: number;
  stressShiftPercent?: number;
}): void {
  if (!Number.isFinite(track.loanAmount) || track.loanAmount <= 0) {
    throw new Error(`loanAmount must be positive, got ${track.loanAmount}`);
  }
  if (!Number.isFinite(track.years) || track.years <= 0) {
    throw new Error(`years must be positive, got ${track.years}`);
  }
  if (
    !Number.isFinite(track.currentCustomerRatePercent) ||
    track.currentCustomerRatePercent < 0
  ) {
    throw new Error(
      `currentCustomerRatePercent cannot be negative, got ${track.currentCustomerRatePercent}`,
    );
  }
  if (
    !Number.isInteger(track.resetPeriodMonths) ||
    track.resetPeriodMonths < 1
  ) {
    throw new Error(
      `resetPeriodMonths must be a positive integer, got ${track.resetPeriodMonths}`,
    );
  }
  if (
    track.stressShiftPercent !== undefined &&
    !Number.isFinite(track.stressShiftPercent)
  ) {
    throw new Error(
      `stressShiftPercent must be a finite number, got ${track.stressShiftPercent}`,
    );
  }
}

/**
 * Shared block-reset variable summary: builds the rate path from the given
 * contractual margin, prices the block-repriced Spitzer schedule (the only
 * preset-verified method for these products), and packages the results.
 */
function summarizeBlockResetTrack(
  track: VariableGovernmentBondTrackInput | VariableMakamTrackInput,
  marginPercent: number,
): { summary: TrackSummary; payments: ReturnType<typeof summarizePayments> } {
  const numberOfPayments = termMonthsFromYears(track.years);

  const ratePath = buildBlockForwardRatePathPercent({
    months: numberOfPayments,
    currentCustomerRatePercent: track.currentCustomerRatePercent,
    resetPeriodMonths: track.resetPeriodMonths,
    marginPercent,
    zeroYieldsPercent: track.forecastZeroYieldsPercent,
    forecastMode: track.forecastMode,
    stressShiftPercent: track.stressShiftPercent,
  });

  // Payment repriced only at reset boundaries, per the track contract.
  // (Equal-principal capability stays in the engine but these presets are
  // verified as Spitzer products, enforced at the type level.)
  const schedule = buildBlockRepricedSpitzerSchedule({
    loanAmount: track.loanAmount,
    annualRatePercentPath: ratePath,
    numberOfPayments,
  });

  const payments = summarizePayments(schedule);
  const monthlyIrr = solveMonthlyIrr(
    track.loanAmount,
    schedule.map((entry) => entry.payment),
  );

  const summary: TrackSummary = {
    // Months 1..V use the offered rate, so the first payment IS the
    // current-rate payment (also true in constant and stress modes).
    monthlyPayment: payments.firstPayment,
    totalPayment: payments.totalPayment,
    totalInterest: roundMoney(payments.totalPayment - track.loanAmount),
    numberOfPayments: schedule.length,
    finalBalance: payments.finalBalance,
    firstPayment: payments.firstPayment,
    lastPayment: payments.lastPayment,
    maximumPayment: payments.maximumPayment,
    minimumPayment: payments.minimumPayment,
    schedule,
    variableForecast: {
      currentFirstPayment: payments.firstPayment,
      forecastFirstPayment: payments.firstPayment,
      forecastMaximumPayment: payments.maximumPayment,
      monthOfForecastMaximumPayment: payments.maximumMonth,
      forecastLastPayment: payments.lastPayment,
      forecastTotalPayment: payments.totalPayment,
      forecastTotalInterest: roundMoney(
        payments.totalPayment - track.loanAmount,
      ),
      forecastOverallRatePercent: (Math.pow(1 + monthlyIrr, 12) - 1) * 100,
      currentOfferedRatePercent: track.currentCustomerRatePercent,
      resetPeriodMonths: track.resetPeriodMonths,
      customerAnchorMarginPercent:
        track.forecastMode === "constant" ? 0 : marginPercent,
      forecastMode: track.forecastMode,
      stressShiftPercent: track.stressShiftPercent ?? 0,
      forecastCurveId: track.forecastCurveId ?? null,
      forecastCurvePublicationDate: track.forecastCurvePublicationDate ?? null,
    },
  };
  return { summary, payments };
}

function calculateGovernmentBondTrackSummary(
  track: VariableGovernmentBondTrackInput,
): TrackSummary {
  assertValidVariableTrackCore(track);
  if (!isGovernmentBondResetMonths(track.resetPeriodMonths)) {
    throw new Error(
      `resetPeriodMonths ${track.resetPeriodMonths} is not a government-bond product option`,
    );
  }
  // Documented baseline: the official zero-curve yield at the reset
  // maturity (A_V) is the anchor for the contractual margin.
  const margin =
    track.forecastMode === "constant"
      ? 0
      : variableAnchorMarginPercent(
          track.currentCustomerRatePercent,
          track.forecastZeroYieldsPercent,
          track.resetPeriodMonths,
        );
  return summarizeBlockResetTrack(track, margin).summary;
}

function calculateMakamTrackSummary(
  track: VariableMakamTrackInput,
): TrackSummary {
  assertValidVariableTrackCore(track);
  if (track.resetPeriodMonths !== 12) {
    throw new Error(
      `The Makam product resets every 12 months, got ${track.resetPeriodMonths}`,
    );
  }
  if (!Number.isFinite(track.currentMakamAnchorPercent)) {
    throw new Error(
      `currentMakamAnchorPercent must be a finite number, got ${track.currentMakamAnchorPercent}`,
    );
  }
  // Contractual margin over the official Makam anchor; future resets are
  // forecast from the nominal zero curve per the Directive-451 table.
  const margin =
    track.forecastMode === "constant"
      ? 0
      : track.currentCustomerRatePercent - track.currentMakamAnchorPercent;
  const { summary } = summarizeBlockResetTrack(track, margin);
  summary.variableForecast!.makamAnchorPercent = track.currentMakamAnchorPercent;
  summary.variableForecast!.makamSnapshotId = track.makamSnapshotId ?? null;
  return summary;
}

/**
 * Compute the summary for a single track.
 *
 * Throws for track types / repayment methods that are not implemented yet,
 * so callers can never silently get a wrong number.
 */
export function calculateTrackSummary(track: MortgageTrackInput): TrackSummary {
  switch (track.type) {
    case "prime":
      return calculatePrimeTrackSummary(track);
    case "variableGovernmentBond":
      return calculateGovernmentBondTrackSummary(track);
    case "variableMakam":
      return calculateMakamTrackSummary(track);
    case "fixedUnlinked": {
      const schedule = buildFixedTrackSchedule(track);
      const payments = summarizePayments(schedule);
      return {
        monthlyPayment: payments.firstPayment,
        totalPayment: payments.totalPayment,
        totalInterest: roundMoney(payments.totalPayment - track.loanAmount),
        numberOfPayments: schedule.length,
        finalBalance: payments.finalBalance,
        firstPayment: payments.firstPayment,
        lastPayment: payments.lastPayment,
        maximumPayment: payments.maximumPayment,
        minimumPayment: payments.minimumPayment,
        schedule,
      };
    }
    default:
      throw new Error(
        `Track type "${(track as { type: string }).type}" is not implemented yet; supported: "fixedUnlinked", "prime", "variableGovernmentBond", "variableMakam"`,
      );
  }
}

/**
 * Compute the combined summary of a multi-track scenario (תמהיל).
 *
 * Tracks are simulated independently and summed by month; a track that has
 * ended simply stops contributing, so the combined payment steps down as
 * shorter tracks finish.
 */
export function calculateScenarioSummary(
  scenario: MortgageScenarioInput,
): ScenarioSummary {
  if (scenario.tracks.length === 0) {
    throw new Error("A scenario must contain at least one track");
  }

  const trackSummaries = scenario.tracks.map(calculateTrackSummary);
  const numberOfPayments = Math.max(
    ...trackSummaries.map((summary) => summary.numberOfPayments),
  );

  const combinedSchedule: AmortizationEntry[] = [];
  for (let month = 1; month <= numberOfPayments; month++) {
    let payment = 0;
    let principalPayment = 0;
    let interestPayment = 0;
    let remainingBalance = 0;
    // Weighted annual rate: each ACTIVE track weighted by its opening
    // principal balance (start of the month, before this month's payment) —
    // never by original amount, payment, or interest.
    let weightedRateNumerator = 0;
    let openingBalanceTotal = 0;

    for (let index = 0; index < trackSummaries.length; index++) {
      const summary = trackSummaries[index];
      const entry = summary.schedule[month - 1];
      if (!entry) continue; // this track has already ended
      payment += entry.payment;
      principalPayment += entry.principalPayment;
      interestPayment += entry.interestPayment;
      remainingBalance += entry.remainingBalance;

      const openingBalance =
        month === 1
          ? scenario.tracks[index].loanAmount
          : summary.schedule[month - 2].remainingBalance;
      if (openingBalance > 0 && entry.activeAnnualRatePercent !== undefined) {
        weightedRateNumerator += openingBalance * entry.activeAnnualRatePercent;
        openingBalanceTotal += openingBalance;
      }
    }

    combinedSchedule.push({
      month,
      payment: roundMoney(payment),
      principalPayment: roundMoney(principalPayment),
      interestPayment: roundMoney(interestPayment),
      remainingBalance: roundMoney(remainingBalance),
      ...(openingBalanceTotal > 0
        ? {
            activeAnnualRatePercent:
              weightedRateNumerator / openingBalanceTotal,
          }
        : {}),
    });
  }

  const totalPayment = roundMoney(
    trackSummaries.reduce((sum, summary) => sum + summary.totalPayment, 0),
  );
  const totalInterest = roundMoney(
    trackSummaries.reduce((sum, summary) => sum + summary.totalInterest, 0),
  );
  const combinedPayments = summarizePayments(combinedSchedule);

  // First payments at today's rates vs. month 1 of the forecast schedules.
  // For non-prime tracks (and constant-mode prime) the two coincide.
  const currentCombinedFirstPayment = roundMoney(
    trackSummaries.reduce(
      (sum, summary) =>
        sum + (summary.forecast?.currentFirstPayment ?? summary.firstPayment),
      0,
    ),
  );

  const totalLoanAmount = scenario.tracks.reduce(
    (sum, track) => sum + track.loanAmount,
    0,
  );
  const combinedMonthlyIrr = solveMonthlyIrr(
    totalLoanAmount,
    combinedSchedule.map((entry) => entry.payment),
  );

  return {
    monthlyPayment: combinedSchedule[0].payment,
    totalPayment,
    totalInterest,
    numberOfPayments,
    finalBalance: combinedPayments.finalBalance,
    firstPayment: combinedPayments.firstPayment,
    lastPayment: combinedPayments.lastPayment,
    maximumPayment: combinedPayments.maximumPayment,
    monthOfMaximumPayment: combinedPayments.maximumMonth,
    minimumPayment: combinedPayments.minimumPayment,
    currentCombinedFirstPayment,
    forecastCombinedFirstPayment: combinedPayments.firstPayment,
    forecastOverallRatePercent: (Math.pow(1 + combinedMonthlyIrr, 12) - 1) * 100,
    trackSummaries,
    combinedSchedule,
  };
}
