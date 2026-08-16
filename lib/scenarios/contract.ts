/**
 * The versioned application contract for a saved mortgage scenario —
 * the shape stored in public.mortgage_scenarios' three JSONB columns.
 *
 * Pure types only. input_payload is the source of truth (it reproduces
 * the scenario in the calculator); result_snapshot and market_references
 * are derived caches, never authoritative.
 */

import type { TrackDraft } from "../mortgage/scenario-form";

/** Bump only on a breaking change to the shape below; a read-time adapter
 * (not written yet — no prior version exists) would handle older rows. */
export const SCENARIO_SCHEMA_VERSION = 1;

/** Source of truth: reproduces the scenario in the calculator, byte-for-
 * byte the same shape the URL query string already round-trips through
 * (see scenario-form.ts's applyTracksToQuery/parseTracksFromQuery). */
export interface StoredScenarioInputPayload {
  schemaVersion: typeof SCENARIO_SCHEMA_VERSION;
  tracks: TrackDraft[];
}

/** Historical cache of what input_payload computed to at calculated_at.
 * Never the source of truth — always recompute from input_payload for
 * current numbers. Field values mirror exactly what the calculator's own
 * results header shows (see MortgageCalculator.tsx's combinedResults). */
export interface StoredScenarioResultSnapshot {
  schemaVersion: typeof SCENARIO_SCHEMA_VERSION;
  totalPrincipal: number;
  firstPayment: number;
  highestPayment: number;
  highestPaymentMonth: number;
  forecastTotalPaid: number;
  totalInterestOrFinancingCost: number;
  stabilityScore: number;
  trackCount: number;
}

/** Per-track market context (curve/Makam IDs, not the underlying arrays)
 * that produced result_snapshot — enough to audit or detect staleness
 * against a fresh calculation, without copying forecast curves into every
 * saved row. */
export interface StoredScenarioMarketReferenceTrack {
  /** Correlates to input_payload.tracks[].id. */
  trackId: string;
  forecastCurveId: string | null;
  makamSnapshotId: string | null;
}

export interface StoredScenarioMarketReferences {
  schemaVersion: typeof SCENARIO_SCHEMA_VERSION;
  boiRatePercent: number;
  boiRateEffectiveDate: string;
  tracks: StoredScenarioMarketReferenceTrack[];
}
