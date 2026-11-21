import { isPayoffDate } from "./parse";
import type {
  PayoffAnchorSeries,
  PayoffLoan,
  PayoffReportFile,
  PayoffTrack,
} from "./types";

/**
 * What the user must still settle on the confirm screen before the figures
 * can drive a simulation. Only active tracks count: a closed track is shown
 * for context and owes nothing.
 */

export type PayoffConfirmField =
  | "linkage"
  | "rateType"
  | "repaymentMethod"
  | "annualRatePercent"
  | "monthlyPayment"
  | "endDate"
  | "principal"
  | "marginPercent"
  | "nextResetDate"
  | "anchorSeries";

export interface PayoffMissingField {
  trackIndex: number;
  field: PayoffConfirmField;
}

export function needsReportDate(loan: PayoffLoan): boolean {
  return !isPayoffDate(loan.asOfDate) && loan.tracks.some((track) => track.status === "active");
}

export function missingTrackFields(track: PayoffTrack): PayoffConfirmField[] {
  if (track.status !== "active") return [];
  const missing: PayoffConfirmField[] = [];
  if (track.linkage === "unknown") missing.push("linkage");
  if (track.rateType === "unknown") missing.push("rateType");
  if (track.repaymentMethod === "unknown") missing.push("repaymentMethod");
  if (track.annualRatePercent === null) missing.push("annualRatePercent");
  if (track.monthlyPayment === null) missing.push("monthlyPayment");
  if (track.endDate === null) missing.push("endDate");
  if (track.balance.principal === null) missing.push("principal");
  if (track.rateType === "variable") {
    if (track.variable?.marginPercent == null) missing.push("marginPercent");
    if (track.variable?.nextResetDate == null) missing.push("nextResetDate");
    if (track.variable?.anchorSeries == null) missing.push("anchorSeries");
  }
  return missing;
}

export function missingLoanFields(loan: PayoffLoan): PayoffMissingField[] {
  return loan.tracks.flatMap((track, trackIndex) =>
    missingTrackFields(track).map((field) => ({ trackIndex, field })),
  );
}

/**
 * A starting suggestion for the anchor, from how Israeli variable tracks are
 * built: resets of two years or more follow the government bond yield of the
 * same linkage for that period, one-year unlinked resets follow the Makam. Shown as
 * a suggestion; the user can change it.
 */
export function suggestAnchorSeries(track: PayoffTrack): PayoffAnchorSeries | null {
  if (track.rateType !== "variable") return null;
  const months = track.variable?.resetFrequencyMonths ?? null;
  if (months === 12 && track.linkage === "unlinked") return "makam";
  if (months !== null && months >= 24) {
    if (track.linkage === "unlinked") return "governmentBondUnlinked";
    if (track.linkage === "cpi") return "governmentBondLinked";
  }
  return null;
}

/** Fill each variable track's anchor with the suggestion where none was chosen. */
export function withSuggestedAnchors(file: PayoffReportFile): PayoffReportFile {
  return {
    ...file,
    loans: file.loans.map((loan) => ({
      ...loan,
      tracks: loan.tracks.map((track) => {
        if (track.variable === null || track.variable.anchorSeries != null) return track;
        const suggestion = suggestAnchorSeries(track);
        return suggestion === null
          ? track
          : { ...track, variable: { ...track.variable, anchorSeries: suggestion } };
      }),
    })),
  };
}

/**
 * A track whose linkage was not read is treated as unlinked when the report
 * shows no sign of linkage on it: no CPI base index and no linkage amount.
 * Reports leave the linkage cell blank for unlinked tracks; a CPI-linked
 * track always carries a base index or accrued linkage. The user can change it.
 */
export function inferLinkage(track: PayoffTrack): PayoffTrack {
  if (track.linkage !== "unknown") return track;
  const linkageSeen =
    track.cpiBaseIndex !== null || (track.balance.indexation !== null && track.balance.indexation !== 0);
  return linkageSeen ? track : { ...track, linkage: "unlinked" };
}

/** What the confirm screen starts from: inferred linkage, then anchor suggestions. */
export function prepareForConfirm(file: PayoffReportFile): PayoffReportFile {
  return withSuggestedAnchors({
    ...file,
    loans: file.loans.map((loan) => ({ ...loan, tracks: loan.tracks.map(inferLinkage) })),
  });
}
