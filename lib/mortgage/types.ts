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

/** Input for a fixed-rate unlinked (קל"צ) track. */
export interface FixedUnlinkedTrackInput {
  /** Optional stable identifier, useful once scenarios are persisted. */
  id?: string;
  type: "fixedUnlinked";
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

/**
 * Input for a prime track. The forecast follows Directive 451: expected
 * anchors are the annualized one-month forwards of the official BOI zero
 * curve, and the customer's rate keeps its margin over prime
 * (prime = BOI rate + 1.5). The current BOI rate and the curve arrive as
 * inputs — the engine never hardcodes market data.
 */
export interface PrimeTrackInput {
  id?: string;
  type: "prime";
  repaymentMethod: RepaymentMethod;
  loanAmount: number;
  years: number;
  /** The annual rate the bank currently offers the customer, percent. */
  currentCustomerRatePercent: number;
  currentBankOfIsraelRatePercent: number;
  /** Official zero spot yields, months 1..360, annual percent. */
  forecastZeroYieldsPercent: readonly number[];
  forecastMode: "official" | "constant" | "stress";
  /** Parallel shift in percentage points (mode "stress" only). */
  stressShiftPercent?: number;
  /** Provenance of the curve used, for display and URL reproducibility. */
  forecastCurveId?: string;
  forecastCurvePublicationDate?: string;
}

import type { GovernmentBondResetMonths } from "./product-catalog";

/**
 * Government-bond variable-unlinked product (משתנה לא צמודה על בסיס אג"ח
 * ממשלתי): rate fixed for `resetPeriodMonths`, then resets to the official
 * forward anchor (Directive-451 nominal zero curve) plus the customer's
 * structural margin over A_V. Principal not CPI-linked. Preset-verified as
 * a Spitzer product; equal-principal engine capability exists but is not
 * exposed for this product.
 */
export interface VariableGovernmentBondTrackInput {
  id?: string;
  type: "variableGovernmentBond";
  repaymentMethod: "spitzer";
  loanAmount: number;
  /** From the product catalog; may be x.5 only where the catalog permits. */
  years: number;
  /** The annual rate the bank currently offers the customer, percent. */
  currentCustomerRatePercent: number;
  resetPeriodMonths: GovernmentBondResetMonths;
  /** Official zero spot yields, months 1..360, annual percent. */
  forecastZeroYieldsPercent: readonly number[];
  forecastMode: "official" | "constant" | "stress";
  stressShiftPercent?: number;
  forecastCurveId?: string;
  forecastCurvePublicationDate?: string;
}

/**
 * Annual-Makam variable-unlinked product (משתנה לא צמודה כל שנה על בסיס
 * מק"מ): rate resets every 12 months. The contractual margin is derived
 * from the official Makam anchor (monthly-average 12-month Makam yield);
 * future resets are forecast from the nominal zero curve per the
 * Directive-451 reference table. Principal not CPI-linked. Spitzer preset.
 */
export interface VariableMakamTrackInput {
  id?: string;
  type: "variableMakam";
  repaymentMethod: "spitzer";
  loanAmount: number;
  /** Whole years only. */
  years: number;
  currentCustomerRatePercent: number;
  /** Fixed by the product — no arbitrary reset periods. */
  resetPeriodMonths: 12;
  /** The official Makam anchor in percent (server-provided snapshot). */
  currentMakamAnchorPercent: number;
  forecastZeroYieldsPercent: readonly number[];
  forecastMode: "official" | "constant" | "stress";
  stressShiftPercent?: number;
  forecastCurveId?: string;
  forecastCurvePublicationDate?: string;
  /** e.g. "2026-06" — pins the anchor month for reproducible links. */
  makamSnapshotId?: string;
}

/** Input for a single mortgage track. */
export type MortgageTrackInput =
  | FixedUnlinkedTrackInput
  | PrimeTrackInput
  | VariableGovernmentBondTrackInput
  | VariableMakamTrackInput;

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
  /** Annual rate active this month, percent. Present on variable tracks. */
  activeAnnualRatePercent?: number;
  /** Balance at the start of the month, before this month's payment. */
  openingBalance?: number;
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
  /**
   * Prime-track forecast results (Directive 451). Present only when the
   * track is a prime track; the schedule above is then the forecast
   * schedule.
   */
  forecast?: PrimeForecastSummary;
  /** Variable-unlinked forecast results; the schedule above is the forecast. */
  variableForecast?: VariableForecastSummary;
}

/** Forecast results for a variable-unlinked track. */
export interface VariableForecastSummary {
  /** First payment — always at the offered rate (the initial fixed block). */
  currentFirstPayment: number;
  forecastFirstPayment: number;
  forecastMaximumPayment: number;
  monthOfForecastMaximumPayment: number;
  forecastLastPayment: number;
  forecastTotalPayment: number;
  forecastTotalInterest: number;
  forecastOverallRatePercent: number;
  currentOfferedRatePercent: number;
  resetPeriodMonths: number;
  /**
   * offeredRate minus the anchor baseline, percent: A_V (zero-curve yield
   * at the reset maturity) for the government-bond product, the official
   * Makam anchor for the Makam product.
   */
  customerAnchorMarginPercent: number;
  forecastMode: "official" | "constant" | "stress";
  stressShiftPercent: number;
  forecastCurveId: string | null;
  forecastCurvePublicationDate: string | null;
  /** Makam product only: the anchor used and its snapshot month. */
  makamAnchorPercent?: number;
  makamSnapshotId?: string | null;
}

/** Forecast results for a prime track. */
export interface PrimeForecastSummary {
  /** First payment at the currently offered rate (ordinary calculation). */
  currentFirstPayment: number;
  forecastFirstPayment: number;
  forecastMaximumPayment: number;
  monthOfForecastMaximumPayment: number;
  forecastLastPayment: number;
  forecastTotalPayment: number;
  forecastTotalInterest: number;
  /** Annualized IRR of (−loan, forecast payments...), percent. */
  forecastOverallRatePercent: number;
  /** customerRate − (BOI rate + 1.5), percent. */
  customerPrimeMarginPercent: number;
  currentPrimeRatePercent: number;
  forecastMode: "official" | "constant" | "stress";
  stressShiftPercent: number;
  forecastCurveId: string | null;
  forecastCurvePublicationDate: string | null;
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
  /** First month in which the combined maximum payment occurs. */
  monthOfMaximumPayment: number;
  minimumPayment: number;
  /**
   * Sum of each track's first payment at today's/current rates (for prime
   * tracks: the payment at the currently offered rate, not the forecast).
   */
  currentCombinedFirstPayment: number;
  /** Sum of month 1 across the (forecast) schedules; equals firstPayment. */
  forecastCombinedFirstPayment: number;
  /** Annualized IRR of (−total loan, combined forecast payments), percent. */
  forecastOverallRatePercent: number;
  /** Per-track results, in input order. */
  trackSummaries: TrackSummary[];
  /**
   * Month-by-month totals across tracks. Once tracks end, they simply stop
   * contributing, so the combined payment can step down over time.
   */
  combinedSchedule: AmortizationEntry[];
}
