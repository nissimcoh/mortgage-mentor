/**
 * Core domain types for mortgage simulation.
 * Pure TypeScript only — no React, no framework imports.
 * Calculation logic will be added here (lib/mortgage/) in a later milestone.
 */

/** Common Israeli mortgage track types. */
export type TrackType =
  | "fixed-unlinked" // קל"צ — fixed rate, not CPI-linked
  | "fixed-linked" // קבועה צמודה — fixed rate, CPI-linked
  | "prime" // פריים — floating, based on prime rate
  | "variable-linked" // משתנה צמודה — variable rate, CPI-linked
  | "variable-unlinked"; // משתנה לא צמודה — variable rate, not CPI-linked

/** A single track (component) within a mortgage mix. */
export interface MortgageTrack {
  id: string;
  type: TrackType;
  /** Principal amount for this track, in ILS. */
  principal: number;
  /** Annual nominal interest rate, as a fraction (e.g. 0.045 for 4.5%). */
  annualInterestRate: number;
  /** Term of this track, in months. */
  termMonths: number;
}

/** A named mortgage scenario composed of one or more tracks. */
export interface MortgageScenario {
  id: string;
  name: string;
  tracks: MortgageTrack[];
}

/** One row of an amortization schedule. */
export interface AmortizationEntry {
  month: number;
  payment: number;
  principalPaid: number;
  interestPaid: number;
  remainingBalance: number;
}
