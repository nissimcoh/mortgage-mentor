import { combinePayoffFiles } from "@/lib/payoff-report/combine";
import type { ExistingMortgageSimulation, ExistingTrackKind } from "@/lib/payoff-report/simulate";
import type { IsoDate, PayoffLoan } from "@/lib/payoff-report/types";
import { TRACK_COLORS } from "@/lib/ui/track-colors";

/**
 * Everything the "my mortgage" summary image shows, taken from the confirmed
 * report and its simulation. Nothing is estimated here: missing report
 * figures stay null and the image leaves their line out.
 */

export const KIND_COLORS: Record<ExistingTrackKind, string> = {
  fixedUnlinked: TRACK_COLORS[0],
  variableUnlinked: TRACK_COLORS[1],
  fixedLinked: TRACK_COLORS[2],
  prime: TRACK_COLORS[3],
  variableLinked: TRACK_COLORS[4],
  heldConstant: "#64748b",
};

export interface SummaryTrack {
  /** Last four digits of the loan number, never the full number. */
  loanTail: string | null;
  label: string | null;
  kind: ExistingTrackKind;
  /** Balance to settle the track today, fees included. */
  totalToSettle: number | null;
  principal: number | null;
  ratePercent: number | null;
  nextResetDate: IsoDate | null;
  monthlyPayment: number | null;
  lastPaymentDate: IsoDate;
  remainingPayments: number;
}

export interface MortgageSummaryData {
  bankNames: string[];
  asOfDates: IsoDate[];
  totalToSettle: number | null;
  fees: number | null;
  monthlyPayment: number | null;
  totalPayment: number;
  lastMonth: string | null;
  /** Share of the starting balance per kind, largest first, summing to 1. */
  composition: { kind: ExistingTrackKind; share: number }[];
  tracks: SummaryTrack[];
}

export function loanTail(loanNumber: string | null): string | null {
  const digits = loanNumber?.replace(/\D/g, "") ?? "";
  return digits.length === 0 ? null : digits.slice(-4);
}

export function buildMortgageSummary(loans: readonly PayoffLoan[], simulation: ExistingMortgageSimulation): MortgageSummaryData {
  const totals = combinePayoffFiles([{ fileName: "", loans: [...loans] }]).totals;
  const tracks: SummaryTrack[] = simulation.tracks.map((simulated) => {
    const loan = loans[simulated.loanIndex];
    const track = loan.tracks[simulated.trackIndex];
    return {
      loanTail: loanTail(loan.loanNumber),
      label: simulated.label,
      kind: simulated.kind,
      totalToSettle: track.balance.totalToSettle,
      principal: track.balance.principal,
      ratePercent: track.annualRatePercent,
      nextResetDate: track.rateType === "variable" ? track.variable?.nextResetDate ?? null : null,
      monthlyPayment: track.monthlyPayment ?? simulated.schedule[0]?.payment ?? null,
      lastPaymentDate: simulated.lastPaymentDate,
      remainingPayments: simulated.numberOfPayments,
    };
  });

  const byKind = new Map<ExistingTrackKind, number>();
  for (const track of simulation.tracks) byKind.set(track.kind, (byKind.get(track.kind) ?? 0) + track.startBalance);
  const start = [...byKind.values()].reduce((sum, value) => sum + value, 0);
  const composition = start > 0
    ? [...byKind].map(([kind, value]) => ({ kind, share: value / start })).sort((a, b) => b.share - a.share)
    : [];

  return {
    bankNames: [...new Set(loans.map((loan) => loan.bankName).filter((name): name is string => Boolean(name)))],
    asOfDates: [...new Set(loans.map((loan) => loan.asOfDate).filter((date): date is string => date !== null))].sort(),
    totalToSettle: totals.totalToSettle,
    fees: totals.fees,
    monthlyPayment: totals.monthlyPayment,
    totalPayment: simulation.totals.totalPayment,
    lastMonth: simulation.totals.lastMonth,
    composition,
    tracks,
  };
}

/**
 * Cards per row for `count` cards: one row up to four, then two rows as
 * even as possible (5 → 3+2, 8 → 4+4), more rows past eight.
 */
export function cardColumns(count: number): number {
  if (count <= 4) return Math.max(1, count);
  return Math.min(4, Math.ceil(count / Math.ceil(count / 4)));
}
