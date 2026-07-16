/**
 * Normalized model of the official Bank of Israel Directive-451 mortgage
 * forecast curve (nominal + real zero yields at monthly maturities 1–360).
 * Pure types, fully serializable — safe to pass to Client Components and
 * ready for historical persistence later.
 */

export type ForecastCurveAverageType = "calendar" | "index";

export interface MortgageForecastCurveSnapshot {
  /** Stable identifier, e.g. "2026-06-calendar". */
  id: string;
  referenceYear: number;
  /** 1-12 */
  referenceMonth: number;
  averageType: ForecastCurveAverageType;
  /** ISO date the row was published per the official schedule workbook. */
  publicationDate: string;
  /** ISO date the row became operative (opening of the next business day). */
  effectiveDate: string;
  /** Zero spot yields in annual percent, maturities 1..360 months, in order. */
  nominalZeroYieldsPercent: number[];
  /** Real (CPI-linked) curve — parsed for future use, no CPI tracks yet. */
  realZeroYieldsPercent: number[];
  fetchedAt: string;
  status: "live" | "fallback";
  sourceId: "boi-directive-451-forecast-workbook";
}

/**
 * One month of the official Makam anchor (monthly-average 12-month Makam
 * yield-to-maturity, BOI SDMX SECDWH series TSB_BAGR_MAKAM_12M.M).
 */
export interface MakamAnchorSnapshot {
  /** e.g. "2026-06" — the reference month, also the pinning ID. */
  id: string;
  referenceYear: number;
  referenceMonth: number;
  /** Monthly-average 12-month Makam yield, annual percent. */
  anchorPercent: number;
  fetchedAt: string;
  status: "live" | "fallback";
  sourceId: "boi-secdwh-makam-12m";
}

export interface MakamAnchorData {
  /** Newest first; `snapshots[0]` is used when no ID is pinned. */
  snapshots: MakamAnchorSnapshot[];
  /** Pinned snapshot IDs that could not be resolved (never substituted). */
  missingSnapshotIds: string[];
  status: "live" | "fallback";
  errors: { sourceId: string; message: string }[];
}

export interface MortgageForecastData {
  /**
   * `curves[0]` is the latest effective curve (used when no curve ID was
   * requested); any further entries are explicitly requested historical
   * curves resolved from the full workbook history. Only these selected
   * snapshots ever reach the client.
   */
  curves: MortgageForecastCurveSnapshot[];
  /**
   * Explicitly requested curve IDs that could not be resolved. They are
   * never silently replaced with the latest curve; the UI must tell the
   * user and let them explicitly update to the latest curve.
   */
  missingCurveIds: string[];
  status: "live" | "fallback";
  errors: { sourceId: string; message: string }[];
}
