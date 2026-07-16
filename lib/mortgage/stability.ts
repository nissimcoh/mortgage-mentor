/**
 * Track stability index (מדד יציבות המסלול).
 *
 * An INTERNAL, product-defined educational score describing how
 * structurally predictable a mortgage track is. It is not an official
 * Bank of Israel score, does not measure the cost of the mortgage, and a
 * higher score does not mean a better or cheaper mortgage — it is not a
 * recommendation.
 *
 * All configuration (dimension values, weights, thresholds) lives in this
 * one module so it can be revised without touching UI components. Scores
 * are derived from track structure only and are never serialized to URLs.
 */

/** Structural dimensions, each 0-100. */
export interface StabilityDimensions {
  /** How certain the interest rate is over the track's life. */
  interestRateCertainty: number;
  /** How certain the principal is (CPI linkage erodes certainty). */
  principalCertainty: number;
  /** How predictable the monthly payment amount is. */
  paymentPredictability: number;
}

export const STABILITY_WEIGHTS = {
  interestRateCertainty: 0.45,
  principalCertainty: 0.35,
  paymentPredictability: 0.2,
} as const;

/** Track archetypes, including future types that are not selectable yet. */
export const TRACK_STABILITY_ARCHETYPES = {
  fixedUnlinked: {
    interestRateCertainty: 100,
    principalCertainty: 100,
    paymentPredictability: 100,
  },
  prime: {
    interestRateCertainty: 40,
    principalCertainty: 100,
    paymentPredictability: 55,
  },
  variableUnlinked: {
    interestRateCertainty: 35,
    principalCertainty: 100,
    paymentPredictability: 45,
  },
  fixedLinked: {
    interestRateCertainty: 100,
    principalCertainty: 25,
    paymentPredictability: 45,
  },
  variableLinked: {
    interestRateCertainty: 25,
    principalCertainty: 20,
    paymentPredictability: 20,
  },
} as const satisfies Record<string, StabilityDimensions>;

export type StabilityTrackKey = keyof typeof TRACK_STABILITY_ARCHETYPES;

/** Weighted 0-100 score. Unrounded — round only for display. */
export function calculateStabilityScore(
  dimensions: StabilityDimensions,
): number {
  return (
    dimensions.interestRateCertainty * STABILITY_WEIGHTS.interestRateCertainty +
    dimensions.principalCertainty * STABILITY_WEIGHTS.principalCertainty +
    dimensions.paymentPredictability * STABILITY_WEIGHTS.paymentPredictability
  );
}

/** Archetype score of a track type. Unrounded. */
export function trackStabilityScore(trackType: StabilityTrackKey): number {
  return calculateStabilityScore(TRACK_STABILITY_ARCHETYPES[trackType]);
}

/**
 * Map an engine track type to its stability archetype. Both variable
 * unlinked products (government-bond and Makam) share the
 * `variableUnlinked` archetype: same structural rate/principal profile.
 */
export function stabilityKeyForTrackType(trackType: string): StabilityTrackKey {
  if (trackType === "variableGovernmentBond" || trackType === "variableMakam") {
    return "variableUnlinked";
  }
  if (trackType in TRACK_STABILITY_ARCHETYPES) {
    return trackType as StabilityTrackKey;
  }
  throw new Error(`No stability archetype for track type "${trackType}"`);
}

export type StabilityLevel =
  | "veryHigh"
  | "high"
  | "medium"
  | "low"
  | "veryLow";

/**
 * Coarse visual state for accessible color bands. Purely presentational
 * semantics — green does not mean cheaper and red does not mean a track
 * should never be selected.
 */
export type StabilityColorState = "stable" | "moderate" | "unstable";

export function stabilityColorState(score: number): StabilityColorState {
  if (score >= 70) return "stable";
  if (score >= 50) return "moderate";
  return "unstable";
}

/** Label bucket for a (possibly unrounded) score. */
export function stabilityLevel(score: number): StabilityLevel {
  if (score >= 90) return "veryHigh";
  if (score >= 70) return "high";
  if (score >= 50) return "medium";
  if (score >= 30) return "low";
  return "veryLow";
}

/**
 * Combined mortgage stability, weighted by each track's ORIGINAL requested
 * amount. Deliberately not weighted by monthly remaining balances: the
 * index describes the structure the user selected at origination.
 */
export function combinedStabilityScore(
  tracks: ReadonlyArray<{ trackType: StabilityTrackKey; loanAmount: number }>,
): number {
  let weighted = 0;
  let total = 0;
  for (const track of tracks) {
    if (!Number.isFinite(track.loanAmount) || track.loanAmount <= 0) continue;
    weighted += track.loanAmount * trackStabilityScore(track.trackType);
    total += track.loanAmount;
  }
  if (total <= 0) {
    throw new Error(
      "combinedStabilityScore requires at least one track with a positive amount",
    );
  }
  return weighted / total;
}
