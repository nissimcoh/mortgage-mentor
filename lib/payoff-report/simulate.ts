import {
  buildBlockRepricedSpitzerSchedule,
  buildCpiLinkedSpitzerSchedule,
  buildPrimeRatePathPercent,
  buildVariableRateEqualPrincipalSchedule,
  buildVariableRateSpitzerSchedule,
  roundMoney,
  spitzerMonthlyPaymentRaw,
  type AmortizationEntry,
} from "@/lib/mortgage";
import { remainingPaymentCounts } from "./checks";
import type { IsoDate, PayoffLoan, PayoffTrack } from "./types";

/**
 * Simulates confirmed existing loans from the report date on: each active
 * track continues from today's balance for its remaining payments, using the
 * engine's schedule builders and the official Directive-451 forecast curve.
 *
 * - Fixed unlinked: the current rate to the end.
 * - Fixed CPI-linked: the current real rate; the balance follows the
 *   official expected CPI path.
 * - Variable (government-bond or Makam anchor): the current rate until the
 *   next reset date printed in the report, then every reset period the
 *   forecast anchor for that period (the forward over the period on the
 *   nominal curve, or the real curve when CPI-linked) plus the contractual
 *   margin from the report.
 * - Prime: the official prime forecast, keeping today's margin over prime.
 * - Anything the engine cannot model honestly (an "other" anchor, balloon)
 *   keeps its current rate and is flagged, never guessed.
 *
 * "constant" mode holds every current rate and zero inflation, for a
 * no-forecast view.
 */

export interface ExistingMortgageMarket {
  boiRatePercent: number;
  /** Zero spot yields, maturities 1..n months, annual percent. */
  nominalZeroYieldsPercent: readonly number[];
  realZeroYieldsPercent: readonly number[];
  /** Expected CPI index, base 100 at maturity 0, months 0..n. */
  expectedCpiIndex: readonly number[];
  curveId?: string;
}

export type ExistingForecastMode = "official" | "constant";

export type ExistingTrackKind =
  | "fixedUnlinked"
  | "fixedLinked"
  | "variableUnlinked"
  | "variableLinked"
  | "prime"
  | "heldConstant";

export type ExistingAssumption =
  /** The track could not be modeled with a forecast; its current rate is held. */
  | "rateHeldConstant"
  /** The repayment method is not one the engine models; treated as Spitzer. */
  | "treatedAsSpitzer"
  /** The term runs past the published curve; its last values are extended. */
  | "curveExtended";

export interface ExistingTrackSimulation {
  loanIndex: number;
  trackIndex: number;
  label: string | null;
  kind: ExistingTrackKind;
  /** Balance the simulation starts from: principal plus accrued linkage. */
  startBalance: number;
  numberOfPayments: number;
  /** Date of payment 1 in `schedule`. */
  firstPaymentDate: IsoDate;
  lastPaymentDate: IsoDate;
  schedule: AmortizationEntry[];
  totalPayment: number;
  /** Total payments minus the starting balance: interest and future linkage. */
  totalCost: number;
  reportedMonthlyPayment: number | null;
  assumptions: ExistingAssumption[];
}

export interface ExistingMonth {
  /** `YYYY-MM` of the payment. */
  month: string;
  payment: number;
  principal: number;
  interest: number;
  /** Balance left after this month's payments, all tracks. */
  balance: number;
}

export interface ExistingMortgageSimulation {
  mode: ExistingForecastMode;
  curveId: string | null;
  tracks: ExistingTrackSimulation[];
  /** Tracks that could not be simulated, with the reason. */
  skipped: { loanIndex: number; trackIndex: number; reason: "missingFields" | "noPaymentsLeft" }[];
  /** All tracks added up by calendar month, in order. */
  months: ExistingMonth[];
  totals: {
    startBalance: number;
    totalPayment: number;
    totalCost: number;
    firstMonthPayment: number;
    maximumPayment: number;
    maximumMonth: string | null;
    lastMonth: string | null;
  };
}

function addMonths(date: IsoDate, months: number): IsoDate {
  const [year, month, day] = date.split("-").map(Number);
  const total = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthKey(date: IsoDate): string {
  return date.slice(0, 7);
}

function monthsBetween(from: IsoDate, to: IsoDate): number {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

/** Date of the next payment after the report date. */
function nextPaymentDate(asOf: IsoDate, paymentDay: number, firstPayment: IsoDate | null): IsoDate {
  if (firstPayment !== null && firstPayment > asOf) return firstPayment;
  const [year, month, day] = asOf.split("-").map(Number);
  const sameMonth = `${year}-${String(month).padStart(2, "0")}-${String(paymentDay).padStart(2, "0")}`;
  return day < paymentDay ? sameMonth : addMonths(sameMonth, 1);
}

/**
 * Zero yield at a maturity, extending the curve flat past its end. Returns
 * whether it had to.
 */
function yieldAt(curve: readonly number[], month: number): { value: number; extended: boolean } {
  const index = Math.min(Math.max(month, 1), curve.length) - 1;
  return { value: curve[index], extended: month > curve.length };
}

/** Annualized forward over months (from, to], Directive-451 block form. */
function forwardPercent(
  curve: readonly number[],
  from: number,
  to: number,
): { value: number; extended: boolean } {
  const end = yieldAt(curve, to);
  const start = from === 0 ? { value: 0, extended: false } : yieldAt(curve, from);
  // Past the curve, the last published forward over the same length stands in.
  if (end.extended) {
    const span = to - from;
    const lastTo = curve.length;
    const lastFrom = Math.max(lastTo - span, 0);
    const forward = forwardPercent(curve, lastFrom, lastTo);
    return { value: forward.value, extended: true };
  }
  const factor =
    Math.pow(1 + end.value / 100, to / 12) / Math.pow(1 + start.value / 100, from / 12);
  return { value: (Math.pow(factor, 12 / (to - from)) - 1) * 100, extended: start.extended };
}

/**
 * Rate path for a block-reset track: the current rate for `firstBlock`
 * payments, then each `period`-month block at forward + margin.
 */
function resetRatePath(
  months: number,
  currentRate: number,
  firstBlock: number,
  period: number,
  margin: number,
  curve: readonly number[],
): { path: number[]; resets: number[]; extended: boolean } {
  const path: number[] = [];
  const resets: number[] = [];
  let extended = false;
  for (let month = 0; month < Math.min(firstBlock, months); month++) path.push(currentRate);
  for (let start = firstBlock; start < months; start += period) {
    const forward = forwardPercent(curve, start, start + period);
    extended ||= forward.extended;
    resets.push(start);
    const rate = forward.value + margin;
    for (let month = start; month < Math.min(start + period, months); month++) path.push(rate);
  }
  return { path, resets, extended };
}

/** Monthly CPI factors from the expected index, extended flat past its end. */
function cpiFactors(index: readonly number[], months: number): { factors: number[]; extended: boolean } {
  const factors: number[] = [];
  let extended = false;
  for (let month = 1; month <= months; month++) {
    if (month < index.length) {
      factors.push(index[month] / index[month - 1]);
    } else {
      extended = true;
      factors.push(factors.length > 0 ? factors[factors.length - 1] : 1);
    }
  }
  return { factors, extended };
}

/**
 * CPI-linked Spitzer whose rate resets at given payment indices: between
 * resets the payment grows with the CPI; at a reset the indexed balance is
 * re-amortized over the remaining payments at the new rate.
 */
function buildLinkedResetSchedule(
  startBalance: number,
  ratePath: readonly number[],
  factors: readonly number[],
  resets: readonly number[],
): AmortizationEntry[] {
  const months = ratePath.length;
  const resetSet = new Set(resets);
  let balance = startBalance;
  let payment = spitzerMonthlyPaymentRaw({
    loanAmount: startBalance,
    monthlyRate: ratePath[0] / 1200,
    numberOfPayments: months,
  });
  const schedule: AmortizationEntry[] = [];
  for (let index = 0; index < months; index++) {
    const openingBalance = balance;
    const indexedBalance = balance * factors[index];
    const monthlyRate = ratePath[index] / 1200;
    payment *= factors[index];
    if (resetSet.has(index)) {
      payment = spitzerMonthlyPaymentRaw({
        loanAmount: indexedBalance,
        monthlyRate,
        numberOfPayments: months - index,
      });
    }
    const interest = indexedBalance * monthlyRate;
    const principal =
      index === months - 1 ? indexedBalance : Math.min(payment - interest, indexedBalance);
    balance = indexedBalance - principal;
    schedule.push({
      month: index + 1,
      payment: roundMoney(principal + interest),
      principalPayment: roundMoney(principal),
      interestPayment: roundMoney(interest),
      remainingBalance: roundMoney(balance),
      openingBalance: roundMoney(openingBalance),
      indexationAmount: roundMoney(indexedBalance - openingBalance),
      activeAnnualRatePercent: ratePath[index],
    });
  }
  return schedule;
}

function simulateTrack(
  track: PayoffTrack,
  asOf: IsoDate,
  market: ExistingMortgageMarket,
  mode: ExistingForecastMode,
): Omit<ExistingTrackSimulation, "loanIndex" | "trackIndex"> | "missingFields" | "noPaymentsLeft" {
  const rate = track.annualRatePercent;
  const principal = track.balance.principal;
  if (rate === null || principal === null || track.endDate === null) return "missingFields";

  const paymentDay = Number((track.firstPaymentDate ?? track.endDate).slice(8, 10));
  const firstPaymentDate = nextPaymentDate(asOf, paymentDay, track.firstPaymentDate);
  const [months] = remainingPaymentCounts(asOf, track.firstPaymentDate ?? firstPaymentDate, track.endDate);
  if (!months || months <= 0) return "noPaymentsLeft";

  const linked = track.linkage === "cpi";
  const startBalance = principal + (linked ? track.balance.indexation ?? 0 : 0);
  const assumptions: ExistingAssumption[] = [];
  const official = mode === "official";
  const equalPrincipal = track.repaymentMethod === "equalPrincipal";
  if (track.repaymentMethod !== "spitzer" && !equalPrincipal) assumptions.push("treatedAsSpitzer");

  const constantPath = Array.from({ length: months }, () => rate);
  const cpi = linked && official
    ? cpiFactors(market.expectedCpiIndex, months)
    : { factors: Array.from({ length: months }, () => 1), extended: false };
  if (cpi.extended) assumptions.push("curveExtended");

  let kind: ExistingTrackKind;
  let schedule: AmortizationEntry[];
  const variable = track.variable;
  const anchor = variable?.anchorSeries ?? null;
  const modelable =
    track.rateType === "fixed" ||
    track.rateType === "prime" ||
    (track.rateType === "variable" &&
      variable !== null &&
      variable.marginPercent !== null &&
      variable.nextResetDate !== null &&
      (anchor === "governmentBondUnlinked" || anchor === "governmentBondLinked" || anchor === "makam"));

  if (!modelable) {
    kind = "heldConstant";
    assumptions.push("rateHeldConstant");
    schedule = linked
      ? buildCpiLinkedSpitzerSchedule({ loanAmount: startBalance, annualRatePercent: rate, numberOfPayments: months, monthlyCpiFactors: cpi.factors })
      : buildBlockRepricedSpitzerSchedule({ loanAmount: startBalance, annualRatePercentPath: constantPath, numberOfPayments: months });
  } else if (track.rateType === "fixed") {
    kind = linked ? "fixedLinked" : "fixedUnlinked";
    schedule = linked
      ? buildCpiLinkedSpitzerSchedule({ loanAmount: startBalance, annualRatePercent: rate, numberOfPayments: months, monthlyCpiFactors: cpi.factors })
      : equalPrincipal
        ? buildVariableRateEqualPrincipalSchedule({ loanAmount: startBalance, annualRatePercentPath: constantPath, numberOfPayments: months })
        : buildBlockRepricedSpitzerSchedule({ loanAmount: startBalance, annualRatePercentPath: constantPath, numberOfPayments: months });
  } else if (track.rateType === "prime") {
    kind = "prime";
    const curve = market.nominalZeroYieldsPercent;
    if (official && curve.length < months) assumptions.push("curveExtended");
    const extendedCurve = Array.from({ length: months }, (_, month) => yieldAt(curve, month + 1).value);
    const path = buildPrimeRatePathPercent({
      months,
      currentCustomerRatePercent: rate,
      currentBankOfIsraelRatePercent: market.boiRatePercent,
      zeroYieldsPercent: extendedCurve,
      forecastMode: official ? "official" : "constant",
    });
    schedule = equalPrincipal
      ? buildVariableRateEqualPrincipalSchedule({ loanAmount: startBalance, annualRatePercentPath: path, numberOfPayments: months })
      : buildVariableRateSpitzerSchedule({ loanAmount: startBalance, annualRatePercentPath: path, numberOfPayments: months });
  } else {
    kind = linked ? "variableLinked" : "variableUnlinked";
    const period = anchor === "makam" ? 12 : variable!.resetFrequencyMonths ?? 60;
    // Payments up to and including the reset date are still at today's rate.
    const firstBlock = Math.max(monthsBetween(firstPaymentDate, variable!.nextResetDate!) + 1, 0);
    const curve = linked ? market.realZeroYieldsPercent : market.nominalZeroYieldsPercent;
    const reset = official
      ? resetRatePath(months, rate, firstBlock, period, variable!.marginPercent!, curve)
      : { path: constantPath, resets: [], extended: false };
    if (reset.extended) assumptions.push("curveExtended");
    schedule = linked
      ? buildLinkedResetSchedule(startBalance, reset.path, cpi.factors, reset.resets)
      : buildBlockRepricedSpitzerSchedule({ loanAmount: startBalance, annualRatePercentPath: reset.path, numberOfPayments: months });
  }

  const totalPayment = roundMoney(schedule.reduce((sum, entry) => sum + entry.payment, 0));
  return {
    label: track.label,
    kind,
    startBalance: roundMoney(startBalance),
    numberOfPayments: months,
    firstPaymentDate,
    lastPaymentDate: addMonths(firstPaymentDate, months - 1),
    schedule,
    totalPayment,
    totalCost: roundMoney(totalPayment - startBalance),
    reportedMonthlyPayment: track.monthlyPayment,
    assumptions: [...new Set(assumptions)],
  };
}

export function simulateExistingMortgage(
  loans: readonly PayoffLoan[],
  market: ExistingMortgageMarket,
  mode: ExistingForecastMode = "official",
): ExistingMortgageSimulation {
  const tracks: ExistingTrackSimulation[] = [];
  const skipped: ExistingMortgageSimulation["skipped"] = [];

  loans.forEach((loan, loanIndex) => {
    loan.tracks.forEach((track, trackIndex) => {
      if (track.status !== "active") return;
      if (loan.asOfDate === null) {
        skipped.push({ loanIndex, trackIndex, reason: "missingFields" });
        return;
      }
      const result = simulateTrack(track, loan.asOfDate, market, mode);
      if (typeof result === "string") skipped.push({ loanIndex, trackIndex, reason: result });
      else tracks.push({ loanIndex, trackIndex, ...result });
    });
  });

  // Add tracks up by calendar month. A track's balance before its first
  // payment counts as its starting balance.
  const byMonth = new Map<string, { payment: number; principal: number; interest: number }>();
  for (const track of tracks) {
    track.schedule.forEach((entry, index) => {
      const key = monthKey(addMonths(track.firstPaymentDate, index));
      const sums = byMonth.get(key) ?? { payment: 0, principal: 0, interest: 0 };
      sums.payment += entry.payment;
      sums.principal += entry.principalPayment;
      sums.interest += entry.interestPayment;
      byMonth.set(key, sums);
    });
  }
  const keys = [...byMonth.keys()].sort();
  const months: ExistingMonth[] = keys.map((key) => {
    const balance = tracks.reduce((sum, track) => {
      const first = monthKey(track.firstPaymentDate);
      if (key < first) return sum + track.startBalance;
      const index = monthsBetween(`${first}-01`, `${key}-01`);
      const entry = track.schedule[Math.min(index, track.schedule.length - 1)];
      return sum + entry.remainingBalance;
    }, 0);
    const sums = byMonth.get(key)!;
    return {
      month: key,
      payment: roundMoney(sums.payment),
      principal: roundMoney(sums.principal),
      interest: roundMoney(sums.interest),
      balance: roundMoney(balance),
    };
  });

  const maximum = months.reduce<ExistingMonth | null>(
    (best, month) => (best === null || month.payment > best.payment ? month : best),
    null,
  );
  const startBalance = roundMoney(tracks.reduce((sum, track) => sum + track.startBalance, 0));
  const totalPayment = roundMoney(tracks.reduce((sum, track) => sum + track.totalPayment, 0));

  return {
    mode,
    curveId: market.curveId ?? null,
    tracks,
    skipped,
    months,
    totals: {
      startBalance,
      totalPayment,
      totalCost: roundMoney(totalPayment - startBalance),
      firstMonthPayment: months[0]?.payment ?? 0,
      maximumPayment: maximum?.payment ?? 0,
      maximumMonth: maximum?.month ?? null,
      lastMonth: months.at(-1)?.month ?? null,
    },
  };
}
