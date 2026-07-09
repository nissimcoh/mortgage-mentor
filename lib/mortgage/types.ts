/**
 * Domain types for the mortgage simulation engine.
 *
 * Pure TypeScript only — no React, no framework imports.
 *
 * Modeling note: this engine is a MONTHLY SIMULATION MODEL. It assumes one
 * payment per month, a constant rate per track, and no fees. Exact bank
 * figures may additionally depend on day-count conventions, actual payment
 * dates, CPI publication dates and linkage mechanics, early-repayment fees,
 * and contract-specific rules. Those belong to later milestones and are
 * intentionally out of scope here.
 */

/**
 * Interest/linkage track types common in Israeli mortgages.
 *
 * Only "fixedUnlinked" is implemented so far. The remaining members exist so
 * that inputs, storage, and UI can already speak the full domain language;
 * the engine throws a clear error when asked to compute them.
 */
export type TrackType =
  | "fixedUnlinked" // קל"צ — fixed rate, not CPI-linked (implemented)
  | "fixedLinked" // קבועה צמודה — fixed rate, CPI-linked (not yet)
  | "prime" // פריים — floating, follows the prime rate (not yet)
  | "variableUnlinked" // משתנה לא צמודה (not yet)
  | "variableLinked" // משתנה צמודה (not yet)
  | "eligibility"; // זכאות — Ministry of Housing subsidized track (not yet)

/**
 * How the principal is repaid over time. Balloon (bullet) and grace are
 * modeled here as repayment methods rather than track types: in practice
 * they modify the payment shape of an underlying interest track.
 */
export type RepaymentMethod =
  | "spitzer" // שפיצר — constant monthly payment (implemented)
  | "equalPrincipal" // קרן שווה — constant principal, declining payment (implemented)
  | "balloon" // בלון — interest only (or nothing) until a final lump sum (not yet)
  | "grace"; // גרייס — deferred period before amortization starts (not yet)

/**
 * How `annualInterestRatePercent` should be interpreted.
 *
 * - "nominalAnnual": the quoted annual rate is nominal, compounded monthly.
 *   monthlyRate = annualRate / 12.
 *   This is how Israeli banks usually quote mortgage rates (ריבית נומינלית).
 *
 * - "effectiveAnnual": the quoted annual rate already includes monthly
 *   compounding (ריבית אפקטיבית/מתואמת).
 *   monthlyRate = (1 + annualRate)^(1/12) - 1.
 *
 * The same percent number produces a slightly higher monthly rate under
 * "nominalAnnual" (e.g. 4.8% nominal → 0.4%/month, while 4.8% effective
 * → ~0.3915%/month).
 */
export type InterestRateInputMode = "nominalAnnual" | "effectiveAnnual";

/** Applied when a track omits `interestRateInputMode`. */
export const DEFAULT_INTEREST_RATE_INPUT_MODE: InterestRateInputMode =
  "nominalAnnual";

/** Input for a single mortgage track. */
export interface MortgageTrackInput {
  /** Optional stable identifier, useful once scenarios are persisted. */
  id?: string;
  type: TrackType;
  repaymentMethod: RepaymentMethod;
  /** Principal borrowed on this track, in ILS. Must be positive. */
  loanAmount: number;
  /** Quoted annual rate in percent (e.g. 4.8 for 4.8%). Must be >= 0. */
  annualInterestRatePercent: number;
  /** Defaults to {@link DEFAULT_INTEREST_RATE_INPUT_MODE} when omitted. */
  interestRateInputMode?: InterestRateInputMode;
  /** Term in years. Must be positive; fractional years round to months. */
  years: number;
}

/** Minimal parameter set for the Spitzer payment/schedule helpers. */
export interface SpitzerPaymentParams {
  loanAmount: number;
  annualInterestRatePercent: number;
  interestRateInputMode?: InterestRateInputMode;
  years: number;
}

/** A named scenario composed of one or more tracks (a "mix" / תמהיל). */
export interface MortgageScenarioInput {
  id?: string;
  name?: string;
  tracks: MortgageTrackInput[];
}

/** One month of an amortization schedule. Money values rounded to agorot. */
export interface AmortizationEntry {
  /** 1-based payment month. */
  month: number;
  /** Total paid this month (principal + interest). */
  payment: number;
  principalPayment: number;
  interestPayment: number;
  /** Balance still owed after this month's payment. */
  remainingBalance: number;
}

/** Computed results for a single track. */
export interface TrackSummary {
  /**
   * The first month's payment. For Spitzer this is also the regular
   * constant payment; for equal principal payments decline over time.
   */
  monthlyPayment: number;
  /** Sum of all payments over the life of the track. */
  totalPayment: number;
  /** totalPayment minus the original principal. */
  totalInterest: number;
  numberOfPayments: number;
  /** Balance after the last payment; 0 for a fully amortizing track. */
  finalBalance: number;
  firstPayment: number;
  lastPayment: number;
  maximumPayment: number;
  minimumPayment: number;
  schedule: AmortizationEntry[];
}

/** Computed results for a whole scenario (all tracks combined). */
export interface ScenarioSummary {
  /** Combined payment in the first month across all tracks. */
  monthlyPayment: number;
  totalPayment: number;
  totalInterest: number;
  /** Length of the longest track, in months. */
  numberOfPayments: number;
  finalBalance: number;
  firstPayment: number;
  lastPayment: number;
  maximumPayment: number;
  minimumPayment: number;
  /** Per-track results, in input order. */
  trackSummaries: TrackSummary[];
  /**
   * Month-by-month totals across tracks. Once tracks end, they simply stop
   * contributing, so the combined payment can step down over time.
   */
  combinedSchedule: AmortizationEntry[];
}
