"use server";

/**
 * Server Actions for saved scenarios. All mutations run through the
 * signed-in user's own Supabase session (never a service-role key) and
 * rely on RLS's ownership policies as the real enforcement boundary —
 * the auth.getUser() checks here make an unauthenticated request never
 * reach the database at all, they are not a substitute for RLS.
 *
 * Every action returns the same small, stable ScenarioActionError
 * contract (see contract.ts) — never a raw Postgres/Supabase error
 * message. Server-side logging (logDatabaseError) may include the
 * error's own safe fields (code/message/hint) for debugging; it never
 * logs the caller's session, tokens, or environment values.
 */

import type { PostgrestError } from "@supabase/supabase-js";
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
import { SCENARIO_SCHEMA_VERSION, type ScenarioActionFailure } from "./contract";
import {
  buildDuplicateRow,
  extractPinnedCurveIds,
  extractPinnedMakamSnapshotIds,
  isValidMarketReferences,
  isValidResultSnapshot,
  validateInputPayload,
  validateScenarioName,
} from "./payload";
import { buildMarketReferences, buildResultSnapshot } from "./snapshot";

/** Safe fields only — a PostgrestError never carries tokens/secrets, but
 * logging the whole error object as a habit is exactly how a stray
 * sensitive field would eventually leak; log by name instead. */
function logDatabaseError(context: string, error: PostgrestError): void {
  console.error(`[scenarios] ${context}:`, {
    code: error.code,
    message: error.message,
    hint: error.hint,
  });
}

export type CreateScenarioResult =
  | { ok: true; id: string }
  | ScenarioActionFailure;

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

  if (error) {
    logDatabaseError("createScenario insert failed", error);
    return { ok: false, error: "database-error" };
  }
  if (!data) return { ok: false, error: "database-error" };
  return { ok: true, id: data.id as string };
}

export type DeleteScenarioResult = { ok: true } | ScenarioActionFailure;

export async function deleteScenario(
  id: unknown,
): Promise<DeleteScenarioResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  if (typeof id !== "string" || id.trim() === "") {
    return { ok: false, error: "not-found" };
  }

  // RLS's "delete own scenarios" policy is the real ownership boundary;
  // this .eq("user_id", ...) is defense-in-depth only, and it uses the
  // authenticated session's own id — never a caller-supplied one. A
  // wrong or foreign id simply matches zero rows here (RLS never
  // distinguishes "doesn't exist" from "not yours") — reported the same
  // safe way either way: "not-found".
  const { data, error } = await supabase
    .from("mortgage_scenarios")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    logDatabaseError("deleteScenario failed", error);
    return { ok: false, error: "database-error" };
  }
  if (!data || data.length === 0) return { ok: false, error: "not-found" };
  return { ok: true };
}

export type RenameScenarioResult = { ok: true } | ScenarioActionFailure;

export interface RenameScenarioInput {
  id: unknown;
  name: unknown;
}

/** Changes only name (and, via the database's own trigger, updated_at) —
 * never touches input_payload, result_snapshot, or market_references. */
export async function renameScenario(
  input: RenameScenarioInput,
): Promise<RenameScenarioResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  if (typeof input.id !== "string" || input.id.trim() === "") {
    return { ok: false, error: "not-found" };
  }

  const name = validateScenarioName(input.name);
  if (name === null) return { ok: false, error: "invalid-name" };

  const { data, error } = await supabase
    .from("mortgage_scenarios")
    .update({ name })
    .eq("id", input.id)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    logDatabaseError("renameScenario failed", error);
    return { ok: false, error: "database-error" };
  }
  if (!data || data.length === 0) return { ok: false, error: "not-found" };
  return { ok: true };
}

export type DuplicateScenarioResult =
  | { ok: true; id: string }
  | ScenarioActionFailure;

/**
 * Copies a scenario the caller owns into a brand-new row: same
 * input_payload/result_snapshot/market_references/schema_version/
 * calculator_version/locale/calculated_at, a new id, a "— Copy"-suffixed
 * name, and fresh created_at/updated_at (the database sets both). Never
 * reuses the source row's id.
 */
export async function duplicateScenario(
  id: unknown,
): Promise<DuplicateScenarioResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  if (typeof id !== "string" || id.trim() === "") {
    return { ok: false, error: "not-found" };
  }

  // Loaded through the caller's own RLS-bound client — a foreign or
  // missing id simply returns no row, not an error.
  const { data: source, error: loadError } = await supabase
    .from("mortgage_scenarios")
    .select(
      "name, schema_version, calculator_version, locale, input_payload, result_snapshot, market_references, calculated_at",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (loadError) {
    logDatabaseError("duplicateScenario load failed", loadError);
    return { ok: false, error: "database-error" };
  }
  if (!source) return { ok: false, error: "not-found" };

  // Never trust a stored row blindly, even one this user already owns —
  // validate its JSON columns the same way any other read path does
  // before propagating them into a new row.
  const payload = validateInputPayload(source.input_payload);
  if (payload === null) return { ok: false, error: "invalid-scenario" };
  if (!isValidResultSnapshot(source.result_snapshot)) {
    return { ok: false, error: "invalid-scenario" };
  }
  if (!isValidMarketReferences(source.market_references)) {
    return { ok: false, error: "invalid-scenario" };
  }

  const row = buildDuplicateRow({
    name: source.name,
    locale: source.locale,
    schemaVersion: source.schema_version,
    calculatorVersion: source.calculator_version,
    inputPayload: payload,
    resultSnapshot: source.result_snapshot,
    marketReferences: source.market_references,
    calculatedAt: source.calculated_at,
  });

  const { data: inserted, error: insertError } = await supabase
    .from("mortgage_scenarios")
    // user_id is the only field added on top of buildDuplicateRow's
    // output — deliberately no id/created_at/updated_at, so this is
    // always a distinct new row, never a copy of the source's identity.
    .insert({ ...row, user_id: user.id })
    .select("id")
    .single();

  if (insertError) {
    logDatabaseError("duplicateScenario insert failed", insertError);
    return { ok: false, error: "database-error" };
  }
  if (!inserted) return { ok: false, error: "database-error" };
  return { ok: true, id: inserted.id as string };
}
