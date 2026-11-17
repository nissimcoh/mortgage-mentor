import { checkPayoffLoan, type PayoffCheck } from "./checks";
import type { IsoDate, PayoffLoan, PayoffReportFile } from "./types";

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
  monthlyPayment: number;
  fees: number;
  totalToSettle: number;
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

  const totals: CombinedPayoffTotals = {
    activeTrackCount: 0,
    monthlyPayment: 0,
    fees: 0,
    totalToSettle: 0,
  };
  for (const { loan } of kept) {
    const loanFees = loan.loanLevelFees ?? 0;
    totals.fees += loanFees;
    totals.totalToSettle += loanFees;
    for (const track of loan.tracks) {
      if (track.status !== "active") continue;
      totals.activeTrackCount++;
      totals.monthlyPayment += track.monthlyPayment ?? 0;
      totals.fees += track.fees.total ?? 0;
      totals.totalToSettle += track.balance.totalToSettle ?? 0;
    }
  }

  const asOfDates = [
    ...new Set(kept.map(({ loan }) => loan.asOfDate).filter((date) => date !== null)),
  ].sort();

  return {
    loans: kept.map((entry) => ({ ...entry, checks: checkPayoffLoan(entry.loan) })),
    skipped,
    asOfDates,
    totals: {
      activeTrackCount: totals.activeTrackCount,
      monthlyPayment: round2(totals.monthlyPayment),
      fees: round2(totals.fees),
      totalToSettle: round2(totals.totalToSettle),
    },
  };
}
