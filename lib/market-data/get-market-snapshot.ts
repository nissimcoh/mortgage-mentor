import "server-only";

/**
 * Server-side entry point: fetch official sources, assemble a normalized
 * snapshot, and never throw — a source failure degrades to the dated
 * fallback values instead of crashing the page.
 */

import { assembleSnapshot, SOURCE_IDS } from "./derive";
import type { MarketSnapshot, MarketSourceError } from "./types";
import { fetchBoiRate } from "./sources/bank-of-israel";
import { fetchLatestCpi } from "./sources/cbs";

export type CalculatorRateSnapshot = Pick<MarketSnapshot, "boiRate" | "nextDecision" | "fetchedAt">;

/** The calculator uses forecast CPI curves, not the latest CBS observation.
 * Reuse the same rate/freshness derivation without waiting for an unused feed. */
export async function getCalculatorRateSnapshot(): Promise<CalculatorRateSnapshot> {
  let boi = null;
  const errors: MarketSourceError[] = [];
  try {
    boi = await fetchBoiRate();
  } catch (reason) {
    errors.push(toSourceError(SOURCE_IDS.boiSdmx, reason));
  }
  const { boiRate, nextDecision, fetchedAt } = assembleSnapshot(
    { boi, cpi: null, errors }, new Date(),
  );
  return { boiRate, nextDecision, fetchedAt };
}

function toSourceError(sourceId: string, reason: unknown): MarketSourceError {
  // Keep messages human-readable and stack-free.
  const message =
    reason instanceof Error ? reason.message : "Unknown source error";
  return { sourceId, message };
}

export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  const errors: MarketSourceError[] = [];

  const [boiResult, cpiResult] = await Promise.allSettled([
    fetchBoiRate(),
    fetchLatestCpi(),
  ]);

  if (boiResult.status === "rejected") {
    errors.push(toSourceError(SOURCE_IDS.boiSdmx, boiResult.reason));
  }
  if (cpiResult.status === "rejected") {
    errors.push(toSourceError(SOURCE_IDS.cbsIndexApi, cpiResult.reason));
  }

  return assembleSnapshot(
    {
      boi: boiResult.status === "fulfilled" ? boiResult.value : null,
      cpi: cpiResult.status === "fulfilled" ? cpiResult.value : null,
      errors,
    },
    new Date(),
  );
}
