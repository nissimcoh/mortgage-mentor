/**
 * Shapes the three server-side market sources (BOI rate/CPI snapshot,
 * Directive-451 forecast curves, Makam anchor snapshots) into the single
 * normalized, serializable object the calculator's and compare's client
 * components need. Pure data transformation — no fetching, no calculation.
 */

import type { MarketSnapshot } from "./types";
import type {
  MakamAnchorData,
  MakamAnchorSnapshot,
  MortgageForecastCurveSnapshot,
  MortgageForecastData,
} from "./mortgage-forecast-types";

export interface CalculatorMarketData {
  boiRatePercent: number;
  /** ISO date the current BOI rate took effect. */
  boiRateEffectiveDate: string;
  boiRateStatus: "live" | "fallback";
  /** ISO datetime of the next scheduled BOI rate decision, or null. */
  boiNextDecisionAt: string | null;
  /** When the BOI-rate/CPI market snapshot was assembled (ISO). */
  marketFetchedAt: string;
  /** Effective official forecast curves, newest first. */
  curves: MortgageForecastCurveSnapshot[];
  curveStatus: "live" | "fallback";
  /** Official Makam anchor snapshots, newest first. */
  makamSnapshots: MakamAnchorSnapshot[];
  makamStatus: "live" | "fallback";
}

export function buildCalculatorMarketData(
  marketSnapshot: MarketSnapshot,
  forecastData: MortgageForecastData,
  makamData: MakamAnchorData,
): CalculatorMarketData {
  return {
    boiRatePercent: marketSnapshot.boiRate.ratePercent,
    boiRateEffectiveDate: marketSnapshot.boiRate.effectiveDate,
    boiRateStatus: marketSnapshot.boiRate.isLive ? "live" : "fallback",
    boiNextDecisionAt: marketSnapshot.nextDecision.at,
    marketFetchedAt: marketSnapshot.fetchedAt,
    curves: forecastData.curves.map((curve) => ({
      ...curve,
      realZeroYieldsPercent: [],
    })),
    curveStatus: forecastData.status,
    makamSnapshots: makamData.snapshots,
    makamStatus: makamData.status,
  };
}
