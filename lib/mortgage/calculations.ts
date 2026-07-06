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
  type MortgageScenarioInput,
  type MortgageTrackInput,
  type ScenarioSummary,
  type SpitzerPaymentParams,
  type TrackSummary,
} from "./types";
import { annualPercentToMonthlyRate, MONTHS_PER_YEAR } from "./interest";
import {
  buildSpitzerSchedule,
  roundMoney,
  spitzerMonthlyPaymentRaw,
} from "./amortization";

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
 * Compute the summary for a single track.
 *
 * Throws for track types / repayment methods that are not implemented yet,
 * so callers can never silently get a wrong number.
 */
export function calculateTrackSummary(track: MortgageTrackInput): TrackSummary {
  if (track.type !== "fixedUnlinked") {
    throw new Error(
      `Track type "${track.type}" is not implemented yet; only "fixedUnlinked" is supported so far`,
    );
  }
  if (track.repaymentMethod !== "spitzer") {
    throw new Error(
      `Repayment method "${track.repaymentMethod}" is not implemented yet; only "spitzer" is supported so far`,
    );
  }

  const schedule = generateSpitzerSchedule(track);

  // Totals are summed from the (already rounded) schedule rows so that the
  // summary always agrees with the table a user would see.
  const totalPayment = roundMoney(
    schedule.reduce((sum, entry) => sum + entry.payment, 0),
  );

  return {
    monthlyPayment: schedule[0].payment,
    totalPayment,
    totalInterest: roundMoney(totalPayment - track.loanAmount),
    numberOfPayments: schedule.length,
    finalBalance: schedule[schedule.length - 1].remainingBalance,
    schedule,
  };
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

  return {
    monthlyPayment: combinedSchedule[0].payment,
    totalPayment,
    totalInterest,
    numberOfPayments,
    finalBalance: combinedSchedule[combinedSchedule.length - 1].remainingBalance,
    trackSummaries,
    combinedSchedule,
  };
}
