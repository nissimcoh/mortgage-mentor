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
} from "./types";
import { annualPercentToMonthlyRate, MONTHS_PER_YEAR } from "./interest";
import {
  buildEqualPrincipalSchedule,
  buildSpitzerSchedule,
  buildVariableRateEqualPrincipalSchedule,
  buildVariableRateSpitzerSchedule,
  roundMoney,
  spitzerMonthlyPaymentRaw,
} from "./amortization";
import {
  buildPrimeRatePathPercent,
  PRIME_BOI_SPREAD_PERCENT,
  solveMonthlyIrr,
} from "./forecast";

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

/** Full month-by-month Spitzer schedule, ending at a zero balance. */
export function generateSpitzerSchedule(
  params: SpitzerPaymentParams,
): AmortizationEntry[] {
  assertValidLoanTerms(params);
  return buildSpitzerSchedule({
    loanAmount: params.loanAmount,
    monthlyRate: annualPercentToMonthlyRate(
      params.annualInterestRatePercent,
      params.interestRateInputMode ?? DEFAULT_INTEREST_RATE_INPUT_MODE,
    ),
    numberOfPayments: toNumberOfPayments(params.years),
  });
}

/**
 * Payment statistics derived from an (already rounded) schedule, so that
 * summaries always agree with the table a user would see.
 */
function summarizePayments(schedule: AmortizationEntry[]) {
  let totalPayment = 0;
  let maximumPayment = -Infinity;
  let minimumPayment = Infinity;
  for (const entry of schedule) {
    totalPayment += entry.payment;
    if (entry.payment > maximumPayment) maximumPayment = entry.payment;
    if (entry.payment < minimumPayment) minimumPayment = entry.payment;
  }
  return {
    totalPayment: roundMoney(totalPayment),
    firstPayment: schedule[0].payment,
    lastPayment: schedule[schedule.length - 1].payment,
    maximumPayment,
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
      return buildSpitzerSchedule(params);
    case "equalPrincipal":
      return buildEqualPrincipalSchedule(params);
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

  let maximumMonth = 1;
  for (const entry of schedule) {
    if (entry.payment === payments.maximumPayment) {
      maximumMonth = entry.month;
      break;
    }
  }

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
      monthOfForecastMaximumPayment: maximumMonth,
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
        `Track type "${(track as { type: string }).type}" is not implemented yet; only "fixedUnlinked" and "prime" are supported so far`,
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

    for (const summary of trackSummaries) {
      const entry = summary.schedule[month - 1];
      if (!entry) continue; // this track has already ended
      payment += entry.payment;
      principalPayment += entry.principalPayment;
      interestPayment += entry.interestPayment;
      remainingBalance += entry.remainingBalance;
    }

    combinedSchedule.push({
      month,
      payment: roundMoney(payment),
      principalPayment: roundMoney(principalPayment),
      interestPayment: roundMoney(interestPayment),
      remainingBalance: roundMoney(remainingBalance),
    });
  }

  const totalPayment = roundMoney(
    trackSummaries.reduce((sum, summary) => sum + summary.totalPayment, 0),
  );
  const totalInterest = roundMoney(
    trackSummaries.reduce((sum, summary) => sum + summary.totalInterest, 0),
  );
  const combinedPayments = summarizePayments(combinedSchedule);

  return {
    monthlyPayment: combinedSchedule[0].payment,
    totalPayment,
    totalInterest,
    numberOfPayments,
    finalBalance: combinedPayments.finalBalance,
    firstPayment: combinedPayments.firstPayment,
    lastPayment: combinedPayments.lastPayment,
    maximumPayment: combinedPayments.maximumPayment,
    minimumPayment: combinedPayments.minimumPayment,
    trackSummaries,
    combinedSchedule,
  };
}
