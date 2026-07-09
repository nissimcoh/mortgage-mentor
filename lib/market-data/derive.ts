/**
 * Pure derivation and assembly logic for market snapshots.
 * No fetching, no framework imports — fully unit-testable.
 */

import {
  FALLBACK_BOI_RATE,
  FALLBACK_CPI,
  FALLBACK_DECISION_DATES,
  FALLBACK_INFLATION_FORECAST,
  FALLBACK_VERIFIED_AT,
} from "./fallback-snapshot";
import type {
  MarketSnapshot,
  MarketSourceError,
} from "./types";

/** Israeli prime = Bank of Israel rate + a fixed 1.5 percentage points. */
export const PRIME_SPREAD_PERCENT = 1.5;

/** A daily rate series is suspicious after a week without observations. */
export const BOI_RATE_STALE_AFTER_DAYS = 7;
/** CPI for month M is published mid-M+1; ~100 days means we missed cycles. */
export const CPI_STALE_AFTER_DAYS = 100;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function derivePrimeRatePercent(boiRatePercent: number): number {
  return Math.round((boiRatePercent + PRIME_SPREAD_PERCENT) * 100) / 100;
}

/** Earliest strictly-future date from `datesIso`, or null when none. */
export function selectNextDecisionDate(
  datesIso: readonly string[],
  now: Date,
): string | null {
  let next: string | null = null;
  for (const iso of datesIso) {
    const time = Date.parse(iso);
    if (!Number.isFinite(time) || time <= now.getTime()) continue;
    if (next === null || time < Date.parse(next)) next = iso;
  }
  return next;
}

/** True when `referenceIso` is more than `maxAgeDays` before `now`. */
export function isStale(
  referenceIso: string,
  now: Date,
  maxAgeDays: number,
): boolean {
  const reference = Date.parse(referenceIso);
  if (!Number.isFinite(reference)) return true;
  return now.getTime() - reference > maxAgeDays * MS_PER_DAY;
}

/** What the source adapters deliver after a successful fetch + parse. */
export interface FetchedBoiRate {
  ratePercent: number;
  effectiveDate: string;
  lastObservationDate: string;
}

export interface FetchedCpi {
  referenceYear: number;
  referenceMonth: number;
  monthlyChangePercent: number;
  indexValue: number;
}

export interface SnapshotParts {
  boi: FetchedBoiRate | null;
  cpi: FetchedCpi | null;
  errors: MarketSourceError[];
}

export const SOURCE_IDS = {
  boiSdmx: "boi-sdmx-br",
  cbsIndexApi: "cbs-index-api-120010",
  boiSchedule: "boi-decision-schedule-fallback",
  boiStaffForecast: "boi-staff-forecast-fallback",
  fallback: "fallback-snapshot",
} as const;

const SOURCE_URLS = {
  boi: "https://www.boi.org.il",
  cbs: "https://www.cbs.gov.il",
};

/**
 * Assemble a normalized snapshot from whatever the sources delivered,
 * filling gaps from the dated fallback values. Never throws.
 */
export function assembleSnapshot(parts: SnapshotParts, now: Date): MarketSnapshot {
  const boiLive = parts.boi !== null;
  const cpiLive = parts.cpi !== null;

  const boiRate = boiLive
    ? {
        ratePercent: parts.boi!.ratePercent,
        effectiveDate: parts.boi!.effectiveDate,
        lastObservationDate: parts.boi!.lastObservationDate,
        isLive: true,
        isStale: isStale(
          parts.boi!.lastObservationDate,
          now,
          BOI_RATE_STALE_AFTER_DAYS,
        ),
        sourceId: SOURCE_IDS.boiSdmx,
        sourceUrl: SOURCE_URLS.boi,
      }
    : {
        ratePercent: FALLBACK_BOI_RATE.ratePercent,
        effectiveDate: FALLBACK_BOI_RATE.effectiveDate,
        lastObservationDate: FALLBACK_VERIFIED_AT,
        isLive: false,
        isStale: false, // fallback is labeled by its verification date instead
        sourceId: SOURCE_IDS.fallback,
        sourceUrl: SOURCE_URLS.boi,
      };

  const cpi = cpiLive
    ? {
        ...parts.cpi!,
        isLive: true,
        isStale: isStale(
          `${parts.cpi!.referenceYear}-${String(parts.cpi!.referenceMonth).padStart(2, "0")}-01`,
          now,
          CPI_STALE_AFTER_DAYS,
        ),
        sourceId: SOURCE_IDS.cbsIndexApi,
        sourceUrl: SOURCE_URLS.cbs,
      }
    : {
        ...FALLBACK_CPI,
        isLive: false,
        isStale: false,
        sourceId: SOURCE_IDS.fallback,
        sourceUrl: SOURCE_URLS.cbs,
      };

  return {
    status: boiLive && cpiLive ? "live" : boiLive || cpiLive ? "partial" : "fallback",
    fetchedAt: now.toISOString(),
    fallbackVerifiedAt: FALLBACK_VERIFIED_AT,
    boiRate,
    primeRate: {
      ratePercent: derivePrimeRatePercent(boiRate.ratePercent),
      isLive: boiRate.isLive,
    },
    nextDecision: {
      at: selectNextDecisionDate(FALLBACK_DECISION_DATES, now),
      isLive: false, // no machine-readable schedule identified yet
      sourceId: SOURCE_IDS.boiSchedule,
      sourceUrl: SOURCE_URLS.boi,
    },
    cpi,
    inflationForecast: {
      ...FALLBACK_INFLATION_FORECAST,
      isLive: false, // staff forecast has no machine-readable series yet
      sourceId: SOURCE_IDS.boiStaffForecast,
      sourceUrl: SOURCE_URLS.boi,
    },
    errors: parts.errors,
  };
}

/** Sanity-check a snapshot: finite numbers, parseable dates, consistent prime. */
export function validateMarketSnapshot(snapshot: MarketSnapshot): boolean {
  const finite = [
    snapshot.boiRate.ratePercent,
    snapshot.primeRate.ratePercent,
    snapshot.cpi.monthlyChangePercent,
    snapshot.cpi.indexValue,
    snapshot.inflationForecast.percent,
  ].every(Number.isFinite);

  const datesOk = [
    snapshot.fetchedAt,
    snapshot.fallbackVerifiedAt,
    snapshot.boiRate.effectiveDate,
    snapshot.boiRate.lastObservationDate,
    ...(snapshot.nextDecision.at === null ? [] : [snapshot.nextDecision.at]),
  ].every((iso) => Number.isFinite(Date.parse(iso)));

  const monthOk =
    Number.isInteger(snapshot.cpi.referenceMonth) &&
    snapshot.cpi.referenceMonth >= 1 &&
    snapshot.cpi.referenceMonth <= 12;

  const primeOk =
    snapshot.primeRate.ratePercent ===
    derivePrimeRatePercent(snapshot.boiRate.ratePercent);

  return finite && datesOk && monthOk && primeOk;
}
