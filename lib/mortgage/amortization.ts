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

    const openingBalance = balance;
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
      openingBalance: roundMoney(openingBalance),
    });
  }

  return schedule;
}

/**
 * Spitzer schedule for a rate that changes only at block boundaries
 * (variable-unlinked tracks). The payment is derived once per rate block —
 * from the opening balance, the block's rate, and the remaining number of
 * payments — and stays UNCHANGED until the next reset (unlike the monthly
 * repricing prime uses). Final month clears the balance exactly.
 */
export function buildBlockRepricedSpitzerSchedule({
  loanAmount,
  annualRatePercentPath,
  numberOfPayments,
}: VariableRateScheduleParams): AmortizationEntry[] {
  const schedule: AmortizationEntry[] = [];
  let balance = loanAmount;
  let payment = 0;

  for (let month = 1; month <= numberOfPayments; month++) {
    const annualRatePercent = annualRatePercentPath[month - 1];
    const monthlyRate = annualRatePercent / 100 / 12;

    // Reprice only when the active rate changes (a reset boundary).
    if (month === 1 || annualRatePercent !== annualRatePercentPath[month - 2]) {
      const remaining = numberOfPayments - month + 1;
      payment =
        monthlyRate === 0
          ? balance / remaining
          : (balance * monthlyRate) /
            (1 - Math.pow(1 + monthlyRate, -remaining));
    }

    const openingBalance = balance;
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
      openingBalance: roundMoney(openingBalance),
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

    const openingBalance = balance;
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
      openingBalance: roundMoney(openingBalance),
    });
  }

  return schedule;
}

export interface CpiLinkedSpitzerParams {
  loanAmount: number;
  /** The fixed LINKED (real) annual rate, percent. */
  annualRatePercent: number;
  numberOfPayments: number;
  /** Monthly CPI indexation factors, index 0 = month 1. */
  monthlyCpiFactors: readonly number[];
}

/**
 * Fixed CPI-linked Spitzer schedule (קבועה צמודה, שיטת שפיצר).
 *
 * The loan behaves as a plain Spitzer in REAL (linked) terms at the fixed
 * rate; nominal values are the real values scaled by the cumulative CPI
 * factor. Implemented iteratively per month:
 *
 *   1. openingBalance   = previous remaining (nominal)
 *   2. indexedBalance   = openingBalance × f_t
 *   3. indexationAmount = indexedBalance − openingBalance
 *   4. interest         = indexedBalance × i
 *   5. payment          = P × C_t   (base real payment, indexed cumulatively)
 *   6. principal        = payment − interest
 *   7. remaining        = indexedBalance − principal
 *
 * The base payment is fixed at the ROUNDED (agorot) amount like every
 * other builder; balances are carried at full precision and the final
 * month repays the remaining balance exactly, so the schedule always ends
 * at exactly 0. Deflationary factors (< 1) flow through unchanged.
 */
export function buildCpiLinkedSpitzerSchedule({
  loanAmount,
  annualRatePercent,
  numberOfPayments,
  monthlyCpiFactors,
}: CpiLinkedSpitzerParams): AmortizationEntry[] {
  const monthlyRate = annualRatePercent / 100 / 12;
  const basePayment = roundMoney(
    spitzerMonthlyPaymentRaw({ loanAmount, monthlyRate, numberOfPayments }),
  );

  const schedule: AmortizationEntry[] = [];
  let balance = loanAmount;
  let cumulativeFactor = 1;

  for (let month = 1; month <= numberOfPayments; month++) {
    const factor = monthlyCpiFactors[month - 1];
    cumulativeFactor *= factor;

    const openingBalance = balance;
    const indexedBalance = openingBalance * factor;
    const indexationAmount = indexedBalance - openingBalance;
    const interestPayment = indexedBalance * monthlyRate;

    let payment = basePayment * cumulativeFactor;
    let principalPayment = payment - interestPayment;
    if (month === numberOfPayments || principalPayment >= indexedBalance) {
      principalPayment = indexedBalance;
      payment = principalPayment + interestPayment;
    }
    balance = indexedBalance - principalPayment;

    schedule.push({
      month,
      payment: roundMoney(principalPayment + interestPayment),
      principalPayment: roundMoney(principalPayment),
      interestPayment: roundMoney(interestPayment),
      remainingBalance: roundMoney(balance),
      activeAnnualRatePercent: annualRatePercent,
      openingBalance: roundMoney(openingBalance),
      indexationAmount: roundMoney(indexationAmount),
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
