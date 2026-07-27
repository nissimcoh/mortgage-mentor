/**
 * Comparison math for the two-scenario compare page (/compare).
 *
 * Pure TypeScript, no React, no new mortgage formulas — everything here
 * either reads fields already present on `MortgageTrackInput`/
 * `ScenarioSummary` (produced by the unmodified engine) or does plain
 * arithmetic (differences, principal-weighted shares) on those values.
 */

import { calculateScenarioSummary } from "./calculations";
import {
  combinedStabilityScore,
  stabilityKeyForTrackType,
} from "./stability";
import type { MortgageTrackInput, ScenarioSummary } from "./types";

/** One scenario ready to compare: its inputs (for exposure/stability) and
 * its calculated summary (for payment figures). */
export interface ScenarioForCompare {
  name: string;
  inputs: MortgageTrackInput[];
  summary: ScenarioSummary;
}

/** Calculates a scenario summary, or `null` if the inputs can't be
 * calculated (mirrors the calculator's own `tryCalculateScenario`). */
export function tryCalculateScenario(
  inputs: MortgageTrackInput[],
): ScenarioSummary | null {
  try {
    return calculateScenarioSummary({ tracks: inputs });
  } catch {
    return null;
  }
}

/**
 * Share (0-100) of the scenario's ORIGINAL principal held in tracks
 * matching `predicate` — never remaining balances, per the original
 * requested amount at origination (same convention as
 * `combinedStabilityScore`). Returns 0 when total principal is 0 or
 * invalid, rather than dividing by zero.
 */
export function principalSharePercent(
  inputs: readonly MortgageTrackInput[],
  predicate: (input: MortgageTrackInput) => boolean,
): number {
  const total = inputs.reduce((sum, input) => sum + input.loanAmount, 0);
  if (!(total > 0)) return 0;
  const matched = inputs
    .filter(predicate)
    .reduce((sum, input) => sum + input.loanAmount, 0);
  return (matched / total) * 100;
}

/** Share of principal in a Prime track. */
export function primeExposurePercent(
  inputs: readonly MortgageTrackInput[],
): number {
  return principalSharePercent(inputs, (input) => input.type === "prime");
}

/**
 * Share of principal that is CPI-linked. Only `fixedLinked` exists today;
 * named generically so a future `variableLinked` product slots in here
 * without renaming this metric.
 */
export function cpiLinkedExposurePercent(
  inputs: readonly MortgageTrackInput[],
): number {
  return principalSharePercent(
    inputs,
    (input) => input.type === "fixedLinked",
  );
}

/**
 * Share of principal whose INTEREST RATE genuinely varies over time:
 * prime, government-bond-anchored, and Makam-anchored tracks. Deliberately
 * excludes `fixedLinked` — its rate is fixed by contract; only the
 * principal is CPI-linked, which is a separate axis (see
 * `cpiLinkedExposurePercent`). Prime intentionally counts toward BOTH its
 * own exposure metric and this one — they measure different risks.
 */
export function variableRateExposurePercent(
  inputs: readonly MortgageTrackInput[],
): number {
  return principalSharePercent(
    inputs,
    (input) =>
      input.type === "prime" ||
      input.type === "variableGovernmentBond" ||
      input.type === "variableMakam",
  );
}

/** Principal-weighted stability score for a scenario's inputs. */
export function scenarioStabilityScore(
  inputs: readonly MortgageTrackInput[],
): number {
  return combinedStabilityScore(
    inputs.map((input) => ({
      trackType: stabilityKeyForTrackType(input.type),
      loanAmount: input.loanAmount,
    })),
  );
}

export type ComparisonMetricKey =
  | "firstPayment"
  | "maxPayment"
  | "totalPayment"
  | "totalInterest"
  | "stabilityScore"
  | "trackCount"
  | "primeExposure"
  | "cpiExposure"
  | "variableExposure";

export interface ComparisonRow {
  metric: ComparisonMetricKey;
  valueA: number;
  valueB: number;
  /** valueB - valueA; positive means B is higher on this metric. */
  diff: number;
}

const METRIC_ORDER: ComparisonMetricKey[] = [
  "firstPayment",
  "maxPayment",
  "totalPayment",
  "totalInterest",
  "stabilityScore",
  "trackCount",
  "primeExposure",
  "cpiExposure",
  "variableExposure",
];

function metricValue(
  metric: ComparisonMetricKey,
  scenario: ScenarioForCompare,
): number {
  switch (metric) {
    case "firstPayment":
      return scenario.summary.currentCombinedFirstPayment;
    case "maxPayment":
      return scenario.summary.maximumPayment;
    case "totalPayment":
      return scenario.summary.totalPayment;
    case "totalInterest":
      return scenario.summary.totalInterest;
    case "stabilityScore":
      return scenarioStabilityScore(scenario.inputs);
    case "trackCount":
      return scenario.inputs.length;
    case "primeExposure":
      return primeExposurePercent(scenario.inputs);
    case "cpiExposure":
      return cpiLinkedExposurePercent(scenario.inputs);
    case "variableExposure":
      return variableRateExposurePercent(scenario.inputs);
  }
}

/** Every comparison row, in a fixed display order. */
export function buildComparisonRows(
  a: ScenarioForCompare,
  b: ScenarioForCompare,
): ComparisonRow[] {
  return METRIC_ORDER.map((metric) => {
    const valueA = metricValue(metric, a);
    const valueB = metricValue(metric, b);
    return { metric, valueA, valueB, diff: valueB - valueA };
  });
}

/** Below this, a total-paid difference reads as noise, not a real gap. */
const COST_INSIGHT_EPSILON_ILS = 1;
/** Rounded-score ties (e.g. 62.4 vs 62.6) shouldn't produce an insight. */
const STABILITY_INSIGHT_EPSILON = 0.5;

export interface CostInsight {
  cheaperSide: "a" | "b" | "tie";
  diffAbs: number;
}

/** Which scenario has the lower forecast total paid, and by how much. */
export function costInsight(
  a: ScenarioForCompare,
  b: ScenarioForCompare,
): CostInsight {
  const diff = b.summary.totalPayment - a.summary.totalPayment;
  if (Math.abs(diff) < COST_INSIGHT_EPSILON_ILS) {
    return { cheaperSide: "tie", diffAbs: 0 };
  }
  return { cheaperSide: diff < 0 ? "b" : "a", diffAbs: Math.abs(diff) };
}

export interface StabilityInsight {
  moreStableSide: "a" | "b" | "tie";
}

/** Which scenario scores higher on the stability index (rounded). */
export function stabilityInsight(
  a: ScenarioForCompare,
  b: ScenarioForCompare,
): StabilityInsight {
  const diff =
    scenarioStabilityScore(b.inputs) - scenarioStabilityScore(a.inputs);
  if (Math.abs(diff) < STABILITY_INSIGHT_EPSILON) {
    return { moreStableSide: "tie" };
  }
  return { moreStableSide: diff > 0 ? "b" : "a" };
}

export type PaymentShapeInsight = { side: "a" | "b" } | null;

/**
 * True only when one scenario has BOTH a strictly lower first payment AND
 * a strictly higher maximum payment than the other — the specific
 * "starts lower, ends higher" shape worth calling out; anything else
 * (e.g. one scenario simply higher on both) yields no insight here.
 */
export function paymentShapeInsight(
  a: ScenarioForCompare,
  b: ScenarioForCompare,
): PaymentShapeInsight {
  const aFirst = a.summary.currentCombinedFirstPayment;
  const bFirst = b.summary.currentCombinedFirstPayment;
  const aMax = a.summary.maximumPayment;
  const bMax = b.summary.maximumPayment;
  if (aFirst < bFirst && aMax > bMax) return { side: "a" };
  if (bFirst < aFirst && bMax > aMax) return { side: "b" };
  return null;
}
