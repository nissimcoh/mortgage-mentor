/**
 * Amortization schedule generation.
 *
 * Pure math on (loanAmount, monthlyRate, numberOfPayments) — everything
 * about quoting conventions and track semantics lives one level up, in
 * calculations.ts. This keeps the core reusable for future repayment
 * methods (equal principal, balloon, grace).
 */

import type { AmortizationEntry } from "./types";

/** Round to 2 decimals (agorot). Money leaves this module already rounded. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface SpitzerScheduleParams {
  loanAmount: number;
  /** Monthly rate as a fraction (e.g. 0.004 for 0.4%/month). */
  monthlyRate: number;
  numberOfPayments: number;
}

/**
 * The classic Spitzer (annuity) payment:
 *
 *   payment = P * i / (1 - (1 + i)^-n)
 *
 * and simply P / n when the rate is zero.
 *
 * Returns the UNROUNDED value; callers round for display.
 */
export function spitzerMonthlyPaymentRaw({
  loanAmount,
  monthlyRate,
  numberOfPayments,
}: SpitzerScheduleParams): number {
  if (monthlyRate === 0) {
    return loanAmount / numberOfPayments;
  }
  return (
    (loanAmount * monthlyRate) /
    (1 - Math.pow(1 + monthlyRate, -numberOfPayments))
  );
}

/**
 * Build a month-by-month Spitzer schedule.
 *
 * Precision strategy: the regular payment is fixed at the ROUNDED (agorot)
 * amount — as banks do — and the running balance is then simulated exactly
 * against that payment, so rounding errors do not compound month over
 * month. The final month simply pays off whatever balance remains, so it
 * absorbs the accumulated sub-agora difference and the schedule always
 * ends at a remaining balance of exactly 0 (this also keeps a 0% loan's
 * total payments equal to the principal to the agora).
 */
export function buildSpitzerSchedule({
  loanAmount,
  monthlyRate,
  numberOfPayments,
}: SpitzerScheduleParams): AmortizationEntry[] {
  const payment = roundMoney(
    spitzerMonthlyPaymentRaw({
      loanAmount,
      monthlyRate,
      numberOfPayments,
    }),
  );

  const schedule: AmortizationEntry[] = [];
  let balance = loanAmount;

  for (let month = 1; month <= numberOfPayments; month++) {
    const interestPayment = balance * monthlyRate;
    let principalPayment = payment - interestPayment;

    // Last month (or if drift ever overshoots): clear the balance exactly.
    if (month === numberOfPayments || principalPayment >= balance) {
      principalPayment = balance;
    }

    balance -= principalPayment;

    schedule.push({
      month,
      payment: roundMoney(principalPayment + interestPayment),
      principalPayment: roundMoney(principalPayment),
      interestPayment: roundMoney(interestPayment),
      remainingBalance: roundMoney(balance),
    });
  }

  return schedule;
}
