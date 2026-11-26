import { checkPayoffLoan, type PayoffCheck } from "./checks";
import type { IsoDate, PayoffLoan, PayoffReportFile, PayoffTrack } from "./types";

/**
 * Several uploaded files describe one household mortgage: a file may hold
 * several loans, and the same loan may be uploaded twice or in an older
 * version. Loans are matched by loan number; the newest report of each loan
 * is kept. Loans without a number are never merged.
 */

export interface CombinedLoan {
  /** Position of the source file and of the loan in it, for editing. */
  fileIndex: number;
  loanIndex: number;
  fileName: string;
  loan: PayoffLoan;
  checks: PayoffCheck[];
}

export interface SkippedLoan {
  fileName: string;
  loanNumber: string;
  /** `duplicate`: same loan and date as a kept one. `olderReport`: a newer one was kept. */
  reason: "duplicate" | "olderReport";
  keptFileName: string;
}

export interface CombinedPayoffTotals {
  activeTrackCount: number;
  monthlyPayment: number | null;
  fees: number | null;
  totalToSettle: number | null;
}

export interface CombinedPayoff {
  loans: CombinedLoan[];
  skipped: SkippedLoan[];
  /** Distinct report dates, oldest first. More than one deserves a notice. */
  asOfDates: IsoDate[];
  totals: CombinedPayoffTotals;
}

/** Digits only, so "10-7071639-01-61" and "1070716390161" match. */
export function normalizeLoanNumber(loanNumber: string | null): string | null {
  if (loanNumber === null) return null;
  const digits = loanNumber.replace(/\D/g, "");
  return digits === "" ? null : digits;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function completeSum(values: readonly (number | null)[]): number | null {
  let sum = 0;
  for (const value of values) {
    if (value === null) return null;
    sum += value;
  }
  return round2(sum);
}

function sumKnown(values: readonly (number | null)[]): number {
  return round2(values.reduce<number>((sum, value) => sum + (value ?? 0), 0));
}

/**
 * A track's early-repayment fees. When the report prints no fee total, the
 * printed fee components are used, and with none at all the fee is 0:
 * reports usually leave out fees that are not charged.
 */
export function trackFees(track: PayoffTrack): number {
  if (track.fees.total !== null) return track.fees.total;
  const { capitalization, notice, averageCpi, operational } = track.fees;
  return sumKnown([capitalization, notice, averageCpi, operational]);
}

/**
 * What settling a track costs: the printed total, or else its printed parts
 * (principal, linkage, interest and charges) plus its fees. Null without a
 * principal, since nothing reliable can stand in for it.
 */
export function trackSettlement(track: PayoffTrack): number | null {
  const { balance } = track;
  if (balance.totalToSettle !== null) return balance.totalToSettle;
  if (balance.principal === null) return null;
  return round2(
    sumKnown([balance.principal, balance.indexation, balance.accruedInterest, balance.futureMonthlyCharge, balance.arrears, balance.otherCharges]) +
      trackFees(track),
  );
}

/** Whether some active track's report shows no fee at all, so it counts as 0. */
export function feesAssumedZero(loans: readonly PayoffLoan[]): boolean {
  return loans.some((loan) =>
    loan.reportedTotals.fees === null &&
    loan.tracks.some(({ status, fees }) =>
      status === "active" &&
      [fees.total, fees.capitalization, fees.notice, fees.averageCpi, fees.operational].every((value) => value === null)),
  );
}

export function combinePayoffFiles(files: readonly PayoffReportFile[]): CombinedPayoff {
  type Kept = { fileIndex: number; loanIndex: number; fileName: string; loan: PayoffLoan };
  const kept: Kept[] = [];
  const keptByNumber = new Map<string, number>();
  const skipped: SkippedLoan[] = [];

  files.forEach((file, fileIndex) => {
    file.loans.forEach((loan, loanIndex) => {
      const entry: Kept = { fileIndex, loanIndex, fileName: file.fileName, loan };
      const key = normalizeLoanNumber(loan.loanNumber);
      const existingIndex = key === null ? undefined : keptByNumber.get(key);
      if (key === null || existingIndex === undefined) {
        if (key !== null) keptByNumber.set(key, kept.length);
        kept.push(entry);
        return;
      }
      const existing = kept[existingIndex];
      const existingDate = existing.loan.asOfDate ?? "";
      const newDate = loan.asOfDate ?? "";
      if (newDate > existingDate) {
        skipped.push({
          fileName: existing.fileName,
          loanNumber: existing.loan.loanNumber ?? key,
          reason: "olderReport",
          keptFileName: file.fileName,
        });
        kept[existingIndex] = entry;
      } else {
        skipped.push({
          fileName: file.fileName,
          loanNumber: loan.loanNumber ?? key,
          reason: newDate === existingDate ? "duplicate" : "olderReport",
          keptFileName: existing.fileName,
        });
      }
    });
  });

  let activeTrackCount = 0;
  const payments: (number | null)[] = [];
  const fees: (number | null)[] = [];
  const balances: (number | null)[] = [];
  for (const { loan } of kept) {
    const loanFees = loan.loanLevelFees ?? 0;
    const active = loan.tracks.filter((track) => track.status === "active");
    activeTrackCount += active.length;
    payments.push(completeSum(active.map((track) => track.monthlyPayment)) ?? loan.reportedTotals.monthlyPayment);
    // The bank's loan totals already include the loan-level fees. Printed
    // figures come first; a fee the report leaves out counts as 0.
    fees.push(
      completeSum([loanFees, ...active.map((track) => track.fees.total)]) ??
        loan.reportedTotals.fees ??
        sumKnown([loanFees, ...active.map(trackFees)]),
    );
    balances.push(
      completeSum([loanFees, ...active.map((track) => track.balance.totalToSettle)]) ??
        loan.reportedTotals.totalToSettle ??
        completeSum([loanFees, ...active.map(trackSettlement)]),
    );
  }

  const asOfDates = [
    ...new Set(kept.map(({ loan }) => loan.asOfDate).filter((date) => date !== null)),
  ].sort();

  return {
    loans: kept.map((entry) => ({ ...entry, checks: checkPayoffLoan(entry.loan) })),
    skipped,
    asOfDates,
    totals: {
      activeTrackCount,
      monthlyPayment: completeSum(payments),
      fees: completeSum(fees),
      totalToSettle: completeSum(balances),
    },
  };
}
