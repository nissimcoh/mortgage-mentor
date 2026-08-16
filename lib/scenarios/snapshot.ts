/**
 * Derives the two cached JSONB columns (result_snapshot, market_references)
 * from an already-computed scenario. Pure data shaping — reuses the
 * engine's own ScenarioSummary/stability output verbatim, never
 * reimplements mortgage math.
 */

import type { CalculatorMarketData } from "../market-data/build-calculator-market-data";
import type { TrackDraft } from "../mortgage/scenario-form";
import { combinedStabilityScore, stabilityKeyForTrackType } from "../mortgage/stability";
import type { MortgageTrackInput, ScenarioSummary } from "../mortgage/types";
import {
  SCENARIO_SCHEMA_VERSION,
  type StoredScenarioMarketReferences,
  type StoredScenarioResultSnapshot,
} from "./contract";

/**
 * Field-for-field, this mirrors exactly what MortgageCalculator's own
 * results header shows (combinedResults): firstPayment is the
 * beginner-friendly "today's rate" payment (currentCombinedFirstPayment),
 * not the forecast-schedule month-1 payment — so what's saved always
 * matches what was on screen when the user clicked Save.
 */
export function buildResultSnapshot(
  inputs: MortgageTrackInput[],
  summary: ScenarioSummary,
): StoredScenarioResultSnapshot {
  const totalPrincipal = inputs.reduce(
    (sum, input) => sum + input.loanAmount,
    0,
  );
  const stabilityScore = combinedStabilityScore(
    inputs.map((input) => ({
      trackType: stabilityKeyForTrackType(input.type),
      loanAmount: input.loanAmount,
    })),
  );

  return {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    totalPrincipal,
    firstPayment: summary.currentCombinedFirstPayment,
    highestPayment: summary.maximumPayment,
    highestPaymentMonth: summary.monthOfMaximumPayment,
    forecastTotalPaid: summary.totalPayment,
    totalInterestOrFinancingCost: summary.totalInterest,
    stabilityScore,
    trackCount: inputs.length,
  };
}

/**
 * Records which curve/Makam snapshot (if any) each track resolved to,
 * plus the BOI rate context — never the underlying forecast arrays, which
 * would bloat every saved row for no benefit (the calculator already
 * re-fetches live curves by ID when a scenario is reopened).
 */
export function buildMarketReferences(
  drafts: TrackDraft[],
  inputs: MortgageTrackInput[],
  marketData: Pick<
    CalculatorMarketData,
    "boiRatePercent" | "boiRateEffectiveDate"
  >,
): StoredScenarioMarketReferences {
  return {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    boiRatePercent: marketData.boiRatePercent,
    boiRateEffectiveDate: marketData.boiRateEffectiveDate,
    tracks: drafts.map((draft, index) => {
      const input = inputs[index];
      const forecastCurveId =
        input.type !== "fixedUnlinked" ? (input.forecastCurveId ?? null) : null;
      const makamSnapshotId =
        input.type === "variableMakam" ? (input.makamSnapshotId ?? null) : null;
      return { trackId: draft.id, forecastCurveId, makamSnapshotId };
    }),
  };
}
