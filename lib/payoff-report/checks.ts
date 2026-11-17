import type { IsoDate, PayoffLoan, PayoffTrack } from "./types";

/**
 * Arithmetic consistency checks on a report as read. A report is internally
 * redundant (parts sum to totals, the payment follows from balance, rate and
 * term), so a misread cell usually breaks at least one identity. Checks never
 * block: they produce warnings for the user to look at before confirming.
 * They are bank-neutral and only run when the figures they need are present.
 */

export type PayoffCheckCode =
  /** Principal + linkage + interest + other charges + fees ≠ total to settle. */
  | "trackBalanceSum"
  /** Fee components ≠ the track's fee total. */
  | "trackFeeSum"
  /** Track payments ≠ the loan's monthly payment. */
  | "loanMonthlyPaymentSum"
  /** Track fees + loan-level fees ≠ the loan's fee total. */
  | "loanFeesSum"
  /** Track totals + loan-level fees ≠ the loan's total to settle. */
  | "loanTotalToSettleSum"
  /** The Spitzer payment implied by balance, rate and remaining term differs. */
  | "spitzerPayment"
  /** The no-notice fee is not 0.1% of the repaid amount (often legitimate). */
  | "noticeFeeRate"
  | "closedTrackHasBalance"
  | "activeTrackPastEndDate"
  /** A variable track is missing its margin or next reset date. */
  | "variableRateDetailsMissing";

export type PayoffCheckSeverity = "warning" | "info";

export interface PayoffCheck {
  code: PayoffCheckCode;
  severity: PayoffCheckSeverity;
  /** Index into `loan.tracks`; null for loan-level checks. */
  trackIndex: number | null;
  expected: number | null;
  actual: number | null;
}

/** Printed amounts are rounded to agorot; allow a few agorot of rounding. */
const MONEY_TOLERANCE = 0.05;
/**
 * Relative tolerance for the implied payment. CPI-linked balances are revalued
 * on a newer index than the payment, which moves the payment by a fraction of
 * a percent; a misread rate or term moves it by far more.
 */
const PAYMENT_RELATIVE_TOLERANCE = 0.01;
const NOTICE_FEE_RATE = 0.001;

function sumKnown(values: readonly (number | null)[]): { sum: number; count: number } {
  let sum = 0;
  let count = 0;
  for (const value of values) {
    if (value !== null) {
      sum += value;
      count++;
    }
  }
  return { sum, count };
}

function moneyClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= MONEY_TOLERANCE;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function dateParts(date: IsoDate): [number, number, number] {
  const [year, month, day] = date.split("-").map(Number);
  return [year, month, day];
}

/**
 * Number of payments still due after `asOfDate`, assuming monthly payments
 * on the first payment's day of month through `endDate` inclusive. When the
 * report date is itself a payment day the bank may or may not have taken that
 * payment yet, so both counts are returned.
 */
export function remainingPaymentCounts(
  asOfDate: IsoDate,
  firstPaymentDate: IsoDate,
  endDate: IsoDate,
): number[] {
  const [asOfYear, asOfMonth, asOfDay] = dateParts(asOfDate);
  const [firstYear, firstMonth, paymentDay] = dateParts(firstPaymentDate);
  const [endYear, endMonth] = dateParts(endDate);

  let nextYear: number;
  let nextMonth: number;
  if (firstPaymentDate > asOfDate) {
    [nextYear, nextMonth] = [firstYear, firstMonth];
  } else if (asOfDay < paymentDay) {
    [nextYear, nextMonth] = [asOfYear, asOfMonth];
  } else {
    [nextYear, nextMonth] = asOfMonth === 12 ? [asOfYear + 1, 1] : [asOfYear, asOfMonth + 1];
  }
  const count = (endYear - nextYear) * 12 + (endMonth - nextMonth) + 1;
  const counts = [count];
  if (asOfDay === paymentDay && firstPaymentDate <= asOfDate) counts.push(count + 1);
  return counts.filter((value) => value > 0);
}

/** Constant monthly payment repaying `balance` over `payments` months. */
export function impliedSpitzerPayment(
  balance: number,
  annualRatePercent: number,
  payments: number,
): number {
  const monthlyRate = annualRatePercent / 1200;
  if (monthlyRate === 0) return balance / payments;
  return (balance * monthlyRate) / -Math.expm1(-payments * Math.log1p(monthlyRate));
}

function checkTrack(
  track: PayoffTrack,
  trackIndex: number,
  asOfDate: IsoDate | null,
): PayoffCheck[] {
  const checks: PayoffCheck[] = [];
  const push = (
    code: PayoffCheckCode,
    severity: PayoffCheckSeverity,
    expected: number | null,
    actual: number | null,
  ) => checks.push({ code, severity, trackIndex, expected, actual });

  const { balance, fees } = track;

  const feeParts = sumKnown([fees.capitalization, fees.notice, fees.averageCpi, fees.operational]);
  if (fees.total !== null && feeParts.count > 0 && !moneyClose(feeParts.sum, fees.total)) {
    push("trackFeeSum", "warning", round2(feeParts.sum), fees.total);
  }

  const balanceParts = sumKnown([
    balance.principal,
    balance.indexation,
    balance.accruedInterest,
    balance.futureMonthlyCharge,
    balance.arrears,
    balance.otherCharges,
    fees.total,
  ]);
  if (
    balance.totalToSettle !== null &&
    balanceParts.count > 0 &&
    !moneyClose(balanceParts.sum, balance.totalToSettle)
  ) {
    push("trackBalanceSum", "warning", round2(balanceParts.sum), balance.totalToSettle);
  }

  const owed = balance.totalToSettle ?? balance.principal ?? 0;
  if (track.status === "closed" && owed > MONEY_TOLERANCE) {
    push("closedTrackHasBalance", "warning", 0, owed);
  }
  if (track.status === "closed") return checks;

  if (asOfDate !== null && track.endDate !== null && track.endDate < asOfDate) {
    push("activeTrackPastEndDate", "warning", null, null);
  }

  if (fees.notice !== null && fees.notice > 0 && balance.principal !== null) {
    const repaid =
      balance.principal + (balance.indexation ?? 0) + (balance.accruedInterest ?? 0);
    const expected = round2(repaid * NOTICE_FEE_RATE);
    if (!moneyClose(expected, fees.notice)) push("noticeFeeRate", "info", expected, fees.notice);
  }

  if (
    track.repaymentMethod === "spitzer" &&
    asOfDate !== null &&
    track.firstPaymentDate !== null &&
    track.endDate !== null &&
    track.annualRatePercent !== null &&
    track.monthlyPayment !== null &&
    track.monthlyPayment > 0 &&
    balance.principal !== null
  ) {
    const base = balance.principal + (balance.indexation ?? 0);
    const counts = remainingPaymentCounts(asOfDate, track.firstPaymentDate, track.endDate);
    const implied = counts.map((count) =>
      impliedSpitzerPayment(base, track.annualRatePercent!, count),
    );
    const matches = implied.some(
      (payment) =>
        Math.abs(payment - track.monthlyPayment!) <=
        PAYMENT_RELATIVE_TOLERANCE * track.monthlyPayment!,
    );
    if (counts.length > 0 && !matches) {
      push("spitzerPayment", "warning", round2(implied[0]), track.monthlyPayment);
    }
  }

  if (
    track.rateType === "variable" &&
    (track.variable === null ||
      track.variable.marginPercent === null ||
      track.variable.nextResetDate === null)
  ) {
    push("variableRateDetailsMissing", "info", null, null);
  }

  return checks;
}

/** Run every applicable check on one loan, track checks first. */
export function checkPayoffLoan(loan: PayoffLoan): PayoffCheck[] {
  const checks = loan.tracks.flatMap((track, index) =>
    checkTrack(track, index, loan.asOfDate),
  );
  const loanCheck = (code: PayoffCheckCode, computed: number, reported: number) => {
    if (!moneyClose(computed, reported)) {
      checks.push({
        code,
        severity: "warning",
        trackIndex: null,
        expected: round2(computed),
        actual: reported,
      });
    }
  };

  const { reportedTotals } = loan;
  const loanFees = loan.loanLevelFees ?? 0;

  const payments = sumKnown(loan.tracks.map((track) => track.monthlyPayment));
  if (reportedTotals.monthlyPayment !== null && payments.count > 0) {
    loanCheck("loanMonthlyPaymentSum", payments.sum, reportedTotals.monthlyPayment);
  }
  const fees = sumKnown(loan.tracks.map((track) => track.fees.total));
  if (reportedTotals.fees !== null && (fees.count > 0 || loan.loanLevelFees !== null)) {
    loanCheck("loanFeesSum", fees.sum + loanFees, reportedTotals.fees);
  }
  const totals = sumKnown(loan.tracks.map((track) => track.balance.totalToSettle));
  if (reportedTotals.totalToSettle !== null && totals.count > 0) {
    loanCheck("loanTotalToSettleSum", totals.sum + loanFees, reportedTotals.totalToSettle);
  }
  return checks;
}
