/**
 * The shared, server-only calculation pipeline behind both createScenario
 * and updateScenario: validate → fetch market data server-side → parse →
 * calculate → derive the two cached JSONB columns. Never touches the
 * database and never checks auth — callers do the auth check first and
 * the insert/update after, so this stays a pure orchestration step with
 * no DB dependency of its own (keeping "auth before any db call" true
 * for every action that uses it).
 *
 * This is the ONE place that turns a name + locale + raw tracks into a
 * storable scenario — createScenario and updateScenario both call it
 * rather than each re-implementing the mortgage-calculation pipeline.
 */

import { isValidLocale, defaultLocale, type Locale } from "../i18n/config";
import { buildCalculatorMarketData } from "../market-data/build-calculator-market-data";
import { getMarketSnapshot } from "../market-data/get-market-snapshot";
import { getMakamAnchorData } from "../market-data/sources/boi-makam";
import { getMortgageForecastData } from "../market-data/sources/boi-mortgage-forecast";
import { calculateScenarioSummary } from "../mortgage/calculations";
import {
  parseAllTrackDrafts,
  type MarketContextForParsing,
} from "../mortgage/scenario-form";
import { SCENARIO_SCHEMA_VERSION, type ScenarioActionFailure } from "./contract";
import {
  extractPinnedCurveIds,
  extractPinnedMakamSnapshotIds,
  validateInputPayload,
  validateScenarioName,
} from "./payload";
import {
  buildMarketReferences,
  buildResultSnapshot,
} from "./snapshot";
import type {
  StoredScenarioInputPayload,
  StoredScenarioMarketReferences,
  StoredScenarioResultSnapshot,
} from "./contract";

export interface PrepareScenarioSaveInput {
  name: unknown;
  locale: unknown;
  tracks: unknown;
}

export interface PreparedScenarioSave {
  ok: true;
  name: string;
  locale: Locale;
  payload: StoredScenarioInputPayload;
  resultSnapshot: StoredScenarioResultSnapshot;
  marketReferences: StoredScenarioMarketReferences;
  calculatedAt: string;
}

export type PrepareScenarioSaveResult =
  | PreparedScenarioSave
  | ScenarioActionFailure;

export async function prepareScenarioSave(
  input: PrepareScenarioSaveInput,
): Promise<PrepareScenarioSaveResult> {
  const name = validateScenarioName(input.name);
  if (name === null) return { ok: false, error: "invalid-name" };

  const locale: Locale =
    typeof input.locale === "string" && isValidLocale(input.locale)
      ? input.locale
      : defaultLocale;

  const payload = validateInputPayload({
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    tracks: input.tracks,
  });
  if (payload === null) return { ok: false, error: "invalid-scenario" };

  // Re-fetch market data server-side, scoped to exactly the curve/Makam
  // IDs the tracks pinned — the same three calls calculator/page.tsx
  // makes, so a reopened/recalculated scenario is reproducible.
  const [marketSnapshot, forecastData, makamData] = await Promise.all([
    getMarketSnapshot(),
    getMortgageForecastData(extractPinnedCurveIds(payload)),
    getMakamAnchorData(extractPinnedMakamSnapshotIds(payload)),
  ]);
  const marketData = buildCalculatorMarketData(
    marketSnapshot,
    forecastData,
    makamData,
  );
  const market: MarketContextForParsing = {
    boiRatePercent: marketData.boiRatePercent,
    curves: marketData.curves,
    makamSnapshots: marketData.makamSnapshots,
  };

  const inputs = parseAllTrackDrafts(payload.tracks, market);
  if (inputs === null) return { ok: false, error: "invalid-scenario" };

  let summary;
  try {
    summary = calculateScenarioSummary({ tracks: inputs });
  } catch {
    return { ok: false, error: "invalid-scenario" };
  }

  const resultSnapshot = buildResultSnapshot(inputs, summary);
  const marketReferences = buildMarketReferences(
    payload.tracks,
    inputs,
    marketData,
  );

  return {
    ok: true,
    name,
    locale,
    payload,
    resultSnapshot,
    marketReferences,
    calculatedAt: new Date().toISOString(),
  };
}
