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

export interface AmortizationParams {
  loanAmount: number;
  /** Monthly rate as a fraction (e.g. 0.004 for 0.4%/month). */
  monthlyRate: number;
  numberOfPayments: number;
}

/** @deprecated Kept as an alias for the original Spitzer-only name. */
export type SpitzerScheduleParams = AmortizationParams;

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
}: AmortizationParams): number {
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
}: AmortizationParams): AmortizationEntry[] {
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

export interface VariableRateScheduleParams {
  loanAmount: number;
  /** Annual rate in percent for each month (index 0 = month 1). */
  annualRatePercentPath: readonly number[];
  numberOfPayments: number;
}

/**
 * Spitzer schedule for a rate that may change every month (prime forecast).
 *
 * Per Directive 451: each month the payment is re-derived from the opening
 * balance, the remaining number of payments, and that month's rate. The
 * balance is carried at full internal precision, only reported values are
 * rounded, and the final month repays the remaining balance exactly.
 */
export function buildVariableRateSpitzerSchedule({
  loanAmount,
  annualRatePercentPath,
  numberOfPayments,
}: VariableRateScheduleParams): AmortizationEntry[] {
  const schedule: AmortizationEntry[] = [];
  let balance = loanAmount;

  for (let month = 1; month <= numberOfPayments; month++) {
    const annualRatePercent = annualRatePercentPath[month - 1];
    const monthlyRate = annualRatePercent / 100 / 12;
    const remaining = numberOfPayments - month + 1;

    const payment =
      monthlyRate === 0
        ? balance / remaining
        : (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -remaining));

    const interestPayment = balance * monthlyRate;
    let principalPayment = payment - interestPayment;
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
      activeAnnualRatePercent: annualRatePercent,
    });
  }

  return schedule;
}

/**
 * Equal-principal schedule for a rate that may change every month: the
 * principal portion follows the standard equal-principal method while the
 * interest uses the rate active in each month, so the payment changes with
 * both the falling balance and the forecast rates. Ends at exactly 0.
 */
export function buildVariableRateEqualPrincipalSchedule({
  loanAmount,
  annualRatePercentPath,
  numberOfPayments,
}: VariableRateScheduleParams): AmortizationEntry[] {
  const regularPrincipal = roundMoney(loanAmount / numberOfPayments);
  const schedule: AmortizationEntry[] = [];
  let balance = loanAmount;

  for (let month = 1; month <= numberOfPayments; month++) {
    const annualRatePercent = annualRatePercentPath[month - 1];
    const monthlyRate = annualRatePercent / 100 / 12;

    const interestPayment = balance * monthlyRate;
    let principalPayment = regularPrincipal;
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
      activeAnnualRatePercent: annualRatePercent,
    });
  }

  return schedule;
}

/**
 * Build a month-by-month equal-principal (קרן שווה) schedule:
 *
 *   principalPayment = loanAmount / numberOfPayments   (constant)
 *   interestPayment  = openingBalance * monthlyRate
 *   payment          = principalPayment + interestPayment
 *
 * With positive interest the payment starts high and declines every month
 * as the balance shrinks.
 *
 * Precision strategy mirrors the Spitzer builder: the regular principal
 * payment is fixed at the ROUNDED (agorot) amount, the balance is simulated
 * exactly against it, and the final month repays whatever balance remains —
 * absorbing the accumulated rounding difference so the schedule always ends
 * at a remaining balance of exactly 0.
 */
export function buildEqualPrincipalSchedule({
  loanAmount,
  monthlyRate,
  numberOfPayments,
}: AmortizationParams): AmortizationEntry[] {
  const regularPrincipal = roundMoney(loanAmount / numberOfPayments);

  const schedule: AmortizationEntry[] = [];
  let balance = loanAmount;

  for (let month = 1; month <= numberOfPayments; month++) {
    const interestPayment = balance * monthlyRate;
    let principalPayment = regularPrincipal;

    // Last month (or if rounding ever overshoots): clear the balance exactly.
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
