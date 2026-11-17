/**
 * Data read from a bank's early-repayment balance report
 * (דוח יתרות לסילוק / פירוט יתרות ועמלות פירעון מוקדם).
 *
 * The shape is bank-neutral: one uploaded file holds one or more loans, and
 * a loan holds one or more tracks (משנים). Every value is nullable because
 * reports differ between banks and a reader may miss a cell. Nothing here is
 * inferred or computed: these are the figures as printed, for the user to
 * confirm before any simulation uses them.
 */

/** Calendar date as `YYYY-MM-DD`. */
export type IsoDate = string;

export type PayoffLinkage = "unlinked" | "cpi" | "foreignCurrency" | "unknown";

/** `prime` is listed separately because it has no fixed reset schedule. */
export type PayoffRateType = "fixed" | "variable" | "prime" | "unknown";

export type PayoffRepaymentMethod =
  | "spitzer"
  | "equalPrincipal"
  | "balloon"
  | "unknown";

/** A closed track was already repaid or refinanced and owes nothing. */
export type PayoffTrackStatus = "active" | "closed";

export interface PayoffVariableRate {
  /** Margin over the anchor, percent (e.g. 0.65 for "עוגן+0.65%"). */
  marginPercent: number | null;
  /** The anchor as printed, e.g. "עוגן" or "פריים". The user names the series. */
  anchorText: string | null;
  resetFrequencyMonths: number | null;
  nextResetDate: IsoDate | null;
  /** Rate when the track was issued, percent, if the report shows it. */
  originalRatePercent: number | null;
}

/** Early-repayment fees for one track, in shekels. */
export interface PayoffFees {
  /** Capitalization fee (עמלת היוון), net of any reduction. */
  capitalization: number | null;
  /** Discount rate used for capitalization (ריבית להיוון), percent. */
  capitalizationRatePercent: number | null;
  capitalizationReductionPercent: number | null;
  capitalizationReductionAmount: number | null;
  /** No-advance-notice fee (עמלת אי הודעה מוקדמת). */
  notice: number | null;
  /** Average-CPI fee (עמלת מדד ממוצע). */
  averageCpi: number | null;
  /** Operational fee when charged per track. Leumi charges it per loan. */
  operational: number | null;
  total: number | null;
}

/** What it costs to settle one track today, in shekels. */
export interface PayoffBalance {
  principal: number | null;
  /** Linkage differentials accrued on the principal (שיערוך קרן / הפרשי הצמדה). */
  indexation: number | null;
  accruedInterest: number | null;
  futureMonthlyCharge: number | null;
  arrears: number | null;
  otherCharges: number | null;
  /** Total to settle the track, including its fees. */
  totalToSettle: number | null;
}

export interface PayoffTrack {
  /** As printed, e.g. "משנה 1". */
  label: string | null;
  status: PayoffTrackStatus;
  /** Loan type as printed, e.g. "מסובסדת" or "פרטית". */
  loanTypeText: string | null;
  originalAmount: number | null;
  startDate: IsoDate | null;
  firstPaymentDate: IsoDate | null;
  endDate: IsoDate | null;
  monthlyPayment: number | null;
  /** Current nominal annual rate, percent. */
  annualRatePercent: number | null;
  repaymentMethod: PayoffRepaymentMethod;
  linkage: PayoffLinkage;
  cpiBaseIndex: number | null;
  rateType: PayoffRateType;
  /** Present for variable-rate tracks. */
  variable: PayoffVariableRate | null;
  fees: PayoffFees;
  balance: PayoffBalance;
}

/** Totals printed by the bank for the whole loan (all tracks). */
export interface PayoffLoanTotals {
  monthlyPayment: number | null;
  fees: number | null;
  totalToSettle: number | null;
}

export interface PayoffLoan {
  bankName: string | null;
  loanNumber: string | null;
  /** The date the balances and fees are valid for. */
  asOfDate: IsoDate | null;
  tracks: PayoffTrack[];
  /** Fees charged once per loan rather than per track (e.g. one operational fee). */
  loanLevelFees: number | null;
  reportedTotals: PayoffLoanTotals;
}

/** Everything read from one uploaded file. */
export interface PayoffReportFile {
  fileName: string;
  loans: PayoffLoan[];
}
