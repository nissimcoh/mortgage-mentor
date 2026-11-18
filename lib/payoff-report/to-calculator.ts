import {
  GOVERNMENT_BOND_RESET_MONTHS,
  GOVERNMENT_BOND_TERM_YEARS,
  MAKAM_TERM_YEARS,
  type GovernmentBondResetMonths,
} from "@/lib/mortgage/product-catalog";
import {
  MAX_TRACKS,
  MAX_YEARS,
  MIN_YEARS,
  applyTracksToQuery,
  createTrackDraft,
  type TrackDraft,
} from "@/lib/mortgage/scenario-form";
import { remainingPaymentCounts } from "./checks";
import type { PayoffLoan, PayoffTrack } from "./types";

/**
 * Calculator links from a confirmed mortgage, written with the calculator's
 * own serializer so they open exactly as the calculator expects:
 *
 * - a new mix: one track on the whole balance to settle (fees included,
 *   since refinancing has to fund them), over the longest remaining term;
 * - the current mix: each active track with its type, rate and balance
 *   (fees included), over the nearest term the calculator offers.
 *
 * The calculator models new loans, so the current mix is an approximation:
 * terms snap to its options, and a variable track restarts its reset cycle
 * instead of keeping the next reset date from the report.
 */

const VARIABLE_LINKED_TERMS = [10, 15, 20, 25, 30] as const;

function nearest(options: readonly number[], value: number): number {
  return options.reduce((best, option) => (Math.abs(option - value) < Math.abs(best - value) ? option : best));
}

function wholeYears(months: number): number {
  return Math.min(MAX_YEARS, Math.max(MIN_YEARS, Math.round(months / 12)));
}

function remainingMonths(track: PayoffTrack, asOfDate: string | null): number | null {
  if (asOfDate === null || track.endDate === null) return null;
  const [months] = remainingPaymentCounts(asOfDate, track.firstPaymentDate ?? track.endDate, track.endDate);
  return months && months > 0 ? months : null;
}

/** Whole shekels, as the calculator's amount field takes them. */
function shekels(value: number): string {
  return String(Math.round(value));
}

function calculatorHref(locale: string, drafts: TrackDraft[]): string {
  return `/${locale}/calculator?${applyTracksToQuery(new URLSearchParams(), drafts).toString()}`;
}

/** One fixed track on `amount`, over `months` rounded to whole years. */
export function newMixHref(locale: string, amount: number, months: number): string {
  const years = wholeYears(months);
  return calculatorHref(locale, [
    createTrackDraft({ trackType: "fixedUnlinked", amount: shekels(amount), years: String(years) }),
  ]);
}

/** The longest remaining term among active tracks, in months (0 if none known). */
export function longestRemainingMonths(loans: readonly PayoffLoan[]): number {
  return Math.max(
    0,
    ...loans.flatMap((loan) =>
      loan.tracks.filter((track) => track.status === "active").map((track) => remainingMonths(track, loan.asOfDate) ?? 0),
    ),
  );
}

interface DraftResult {
  draft: TrackDraft;
  approximated: boolean;
}

function trackDraft(track: PayoffTrack, months: number, amount: number): DraftResult | null {
  const rate = track.annualRatePercent;
  if (rate === null) return null;
  const exactYears = months / 12;
  const linked = track.linkage === "cpi";
  const repaymentMethod = track.repaymentMethod === "equalPrincipal" ? "equalPrincipal" : "spitzer";
  const base = { amount: shekels(amount), repaymentMethod };

  if (track.rateType === "prime") {
    const years = wholeYears(months);
    return {
      draft: createTrackDraft({ ...base, trackType: "prime", currentRatePercent: String(rate), years: String(years) }),
      approximated: years !== exactYears,
    };
  }

  if (track.rateType === "variable" && track.variable !== null) {
    const anchor = track.variable.anchorSeries;
    if (anchor === "makam" && !linked) {
      const years = nearest(MAKAM_TERM_YEARS, exactYears);
      return {
        draft: createTrackDraft({ ...base, trackType: "variableMakam", repaymentMethod: "spitzer", currentRatePercent: String(rate), years: String(years) }),
        // The calculator restarts the 12-month cycle today.
        approximated: true,
      };
    }
    if (anchor === "governmentBondLinked" || (linked && anchor !== "other")) {
      const years = nearest(VARIABLE_LINKED_TERMS, exactYears);
      return {
        draft: createTrackDraft({ ...base, trackType: "variableLinked", repaymentMethod: "spitzer", currentRatePercent: String(rate), resetPeriodMonths: "60", years: String(years) }),
        approximated: true,
      };
    }
    if (anchor === "governmentBondUnlinked") {
      const printed = track.variable.resetFrequencyMonths ?? 60;
      const reset = nearest(GOVERNMENT_BOND_RESET_MONTHS, printed) as GovernmentBondResetMonths;
      const years = nearest(GOVERNMENT_BOND_TERM_YEARS[reset], exactYears);
      return {
        draft: createTrackDraft({ ...base, trackType: "variableGovernmentBond", repaymentMethod: "spitzer", currentRatePercent: String(rate), resetPeriodMonths: String(reset), years: String(years) }),
        approximated: true,
      };
    }
  }

  // Fixed (and anything the calculator has no product for, at today's rate).
  const years = wholeYears(months);
  const exact = track.rateType === "fixed" && years === exactYears;
  return linked
    ? {
        draft: createTrackDraft({ ...base, trackType: "fixedLinked", repaymentMethod: "spitzer", currentRatePercent: String(rate), years: String(years) }),
        approximated: !exact,
      }
    : {
        draft: createTrackDraft({ ...base, trackType: "fixedUnlinked", ratePercent: String(rate), years: String(years) }),
        approximated: !exact,
      };
}

/**
 * The current mix as a calculator link, or null when it can't be one
 * (no usable active track, or more tracks than the calculator holds).
 */
export function currentMixHref(
  locale: string,
  loans: readonly PayoffLoan[],
): { href: string; approximated: boolean } | null {
  const results: DraftResult[] = [];
  for (const loan of loans) {
    const active = loan.tracks.filter((track) => track.status === "active");
    // Fees charged once per loan ride on its largest track, so the mix
    // still adds up to the loan's balance to settle.
    const amounts = active.map((track) => track.balance.totalToSettle ?? (track.balance.principal ?? 0) + (track.balance.indexation ?? 0));
    const largest = amounts.indexOf(Math.max(...amounts));
    for (const [index, track] of active.entries()) {
      const months = remainingMonths(track, loan.asOfDate);
      if (months === null) return null;
      const amount = amounts[index] + (index === largest ? loan.loanLevelFees ?? 0 : 0);
      const result = trackDraft(track, months, amount);
      if (result === null || amount <= 0) return null;
      results.push(result);
    }
  }
  if (results.length === 0 || results.length > MAX_TRACKS) return null;
  return {
    href: calculatorHref(locale, results.map((result) => result.draft)),
    approximated: results.some((result) => result.approximated),
  };
}
