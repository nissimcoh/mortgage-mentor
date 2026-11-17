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
 * built: five-year resets follow the five-year government bond yield of the
 * same linkage, one-year unlinked resets follow the one-year Makam. Shown as
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
