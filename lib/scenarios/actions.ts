"use server";

/**
 * Server Actions for saved scenarios. All mutations run through the
 * signed-in user's own Supabase session (never a service-role key) and
 * rely on RLS's ownership policies as the real enforcement boundary —
 * the auth.getUser() checks here make an unauthenticated request never
 * reach the database at all, they are not a substitute for RLS.
 *
 * Never trusts browser-supplied numbers: createScenario re-derives
 * result_snapshot/market_references from a fresh server-side calculation
 * of the (structurally re-validated) tracks, and user_id always comes
 * from the authenticated session, never from the caller's payload.
 */

import { isValidLocale, defaultLocale, type Locale } from "../i18n/config";
import { buildCalculatorMarketData } from "../market-data/build-calculator-market-data";
import { getMarketSnapshot } from "../market-data/get-market-snapshot";
import { getMakamAnchorData } from "../market-data/sources/boi-makam";
import { getMortgageForecastData } from "../market-data/sources/boi-mortgage-forecast";
import { CALCULATOR_VERSION } from "../mortgage/calculator-version";
import { calculateScenarioSummary } from "../mortgage/calculations";
import {
  parseAllTrackDrafts,
  type MarketContextForParsing,
} from "../mortgage/scenario-form";
import { createClient } from "../supabase/server";
import { SCENARIO_SCHEMA_VERSION } from "./contract";
import {
  extractPinnedCurveIds,
  extractPinnedMakamSnapshotIds,
  validateInputPayload,
  validateScenarioName,
} from "./payload";
import { buildMarketReferences, buildResultSnapshot } from "./snapshot";

export type CreateScenarioError =
  | "unauthenticated"
  | "invalidName"
  | "invalidScenario"
  | "saveFailed";

export type CreateScenarioResult =
  | { ok: true; id: string }
  | { ok: false; error: CreateScenarioError };

export interface CreateScenarioInput {
  name: unknown;
  locale: unknown;
  tracks: unknown;
}

export async function createScenario(
  input: CreateScenarioInput,
): Promise<CreateScenarioResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const name = validateScenarioName(input.name);
  if (name === null) return { ok: false, error: "invalidName" };

  const locale: Locale =
    typeof input.locale === "string" && isValidLocale(input.locale)
      ? input.locale
      : defaultLocale;

  const payload = validateInputPayload({
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    tracks: input.tracks,
  });
  if (payload === null) return { ok: false, error: "invalidScenario" };

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
  if (inputs === null) return { ok: false, error: "invalidScenario" };

  let summary;
  try {
    summary = calculateScenarioSummary({ tracks: inputs });
  } catch {
    return { ok: false, error: "invalidScenario" };
  }

  const resultSnapshot = buildResultSnapshot(inputs, summary);
  const marketReferences = buildMarketReferences(
    payload.tracks,
    inputs,
    marketData,
  );

  const { data, error } = await supabase
    .from("mortgage_scenarios")
    .insert({
      // Ownership is set from the authenticated session, never from the
      // caller — RLS's "insert own scenarios" policy would reject any
      // other value here regardless.
      user_id: user.id,
      name,
      schema_version: SCENARIO_SCHEMA_VERSION,
      calculator_version: CALCULATOR_VERSION,
      locale,
      input_payload: payload,
      result_snapshot: resultSnapshot,
      market_references: marketReferences,
      calculated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: "saveFailed" };
  return { ok: true, id: data.id as string };
}

export type DeleteScenarioError = "unauthenticated" | "deleteFailed";

export type DeleteScenarioResult =
  | { ok: true }
  | { ok: false; error: DeleteScenarioError };

export async function deleteScenario(
  id: unknown,
): Promise<DeleteScenarioResult> {
  if (typeof id !== "string" || id.trim() === "") {
    return { ok: false, error: "deleteFailed" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  // RLS's "delete own scenarios" policy is the real ownership boundary;
  // this .eq("user_id", ...) is defense-in-depth only, and it uses the
  // authenticated session's own id — never a caller-supplied one.
  const { error } = await supabase
    .from("mortgage_scenarios")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: "deleteFailed" };
  return { ok: true };
}
