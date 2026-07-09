/**
 * Normalized market-data model.
 *
 * Pure types only — no fetching here. Each value group carries its own
 * provenance (`isLive`, `sourceId`) so the UI can label live data,
 * stale data, and dated fallback data honestly. The flat, serializable
 * shape is deliberate: it can be persisted as-is once historical
 * snapshots get stored.
 */

/**
 * Overall snapshot status, scoped to the machine-fetchable sources
 * (BOI rate, CPI): "live" when all fetched, "partial" when some did,
 * "fallback" when none did. The decision schedule and staff forecast are
 * static reference data (no machine-readable source yet) and are tracked
 * per-field via `isLive` instead.
 */
export type MarketDataStatus = "live" | "partial" | "fallback";

export interface MarketSourceError {
  sourceId: string;
  /** Sanitized, human-readable message. Never a stack trace. */
  message: string;
}

export interface BoiRateData {
  ratePercent: number;
  /** ISO date the current rate took effect (start of the latest value run). */
  effectiveDate: string;
  /** ISO date of the newest observation seen (drives staleness). */
  lastObservationDate: string;
  isLive: boolean;
  isStale: boolean;
  sourceId: string;
  sourceUrl: string;
}

export interface PrimeRateData {
  /** Always derived: BOI rate + the fixed prime spread. */
  ratePercent: number;
  isLive: boolean;
}

export interface NextDecisionData {
  /** ISO datetime with offset, or null when no future date is known. */
  at: string | null;
  isLive: boolean;
  sourceId: string;
  sourceUrl: string;
}

export interface CpiData {
  referenceYear: number;
  /** 1-12 */
  referenceMonth: number;
  monthlyChangePercent: number;
  indexValue: number;
  isLive: boolean;
  isStale: boolean;
  sourceId: string;
  sourceUrl: string;
}

export interface InflationForecastData {
  percent: number;
  /** The forecast covers the four quarters ending in this quarter. */
  horizonEndYear: number;
  horizonEndQuarter: number;
  isLive: boolean;
  sourceId: string;
  sourceUrl: string;
}

export interface MarketSnapshot {
  status: MarketDataStatus;
  /** ISO datetime this snapshot was assembled. */
  fetchedAt: string;
  /** Date the fallback values were last human-verified against sources. */
  fallbackVerifiedAt: string;
  boiRate: BoiRateData;
  primeRate: PrimeRateData;
  nextDecision: NextDecisionData;
  cpi: CpiData;
  inflationForecast: InflationForecastData;
  errors: MarketSourceError[];
}
