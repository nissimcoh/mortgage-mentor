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
 *
 * createScenario and updateScenario share the mortgage-calculation
 * pipeline via prepareScenarioSave (compute.ts) — neither trusts a
 * client-supplied result_snapshot/market_references; both re-derive them
 * server-side from the (re-validated) tracks.
 */

import type { PostgrestError } from "@supabase/supabase-js";
import { CALCULATOR_VERSION } from "../mortgage/calculator-version";
import { createClient } from "../supabase/server";
import { prepareScenarioSave, type PrepareScenarioSaveInput } from "./compute";
import { SCENARIO_SCHEMA_VERSION, type ScenarioActionFailure } from "./contract";
import {
  buildDuplicateRow,
  isValidMarketReferences,
  isValidResultSnapshot,
  validateInputPayload,
  validateScenarioName,
} from "./payload";

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

export type CreateScenarioInput = PrepareScenarioSaveInput;

export async function createScenario(
  input: CreateScenarioInput,
): Promise<CreateScenarioResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const prepared = await prepareScenarioSave(input);
  if (!prepared.ok) return prepared;

  const { data, error } = await supabase
    .from("mortgage_scenarios")
    .insert({
      // Ownership is set from the authenticated session, never from the
      // caller — RLS's "insert own scenarios" policy would reject any
      // other value here regardless.
      user_id: user.id,
      name: prepared.name,
      schema_version: SCENARIO_SCHEMA_VERSION,
      calculator_version: CALCULATOR_VERSION,
      locale: prepared.locale,
      input_payload: prepared.payload,
      result_snapshot: prepared.resultSnapshot,
      market_references: prepared.marketReferences,
      calculated_at: prepared.calculatedAt,
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

export type UpdateScenarioResult = { ok: true } | ScenarioActionFailure;

export interface UpdateScenarioInput extends PrepareScenarioSaveInput {
  id: unknown;
  /** The row's updated_at value at the moment edit mode began — an
   * optimistic-concurrency token, NEVER an authorization check. If it no
   * longer matches the row's current updated_at, the update is refused
   * with "scenario-changed" rather than silently overwriting whatever
   * changed the row in the meantime. */
  expectedUpdatedAt: unknown;
}

/**
 * Overwrites an existing scenario the caller owns with a freshly
 * server-calculated snapshot — the explicit "update original scenario"
 * choice from edit mode. Updates name/schema_version/calculator_version/
 * locale/input_payload/result_snapshot/market_references/calculated_at;
 * id, user_id, and created_at are never touched, and updated_at comes
 * from the table's own trigger, not application code.
 */
export async function updateScenario(
  input: UpdateScenarioInput,
): Promise<UpdateScenarioResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  if (typeof input.id !== "string" || input.id.trim() === "") {
    return { ok: false, error: "not-found" };
  }
  if (
    typeof input.expectedUpdatedAt !== "string" ||
    input.expectedUpdatedAt.trim() === ""
  ) {
    // Malformed edit context shouldn't happen from the app's own UI —
    // treat it the same as any other structurally invalid request.
    return { ok: false, error: "invalid-scenario" };
  }

  const prepared = await prepareScenarioSave(input);
  if (!prepared.ok) return prepared;

  // Atomic compare-and-write: only succeeds if updated_at still matches
  // what the client captured when edit mode began. RLS's "update own
  // scenarios" policy (via .eq("user_id", ...)) remains the real
  // ownership boundary; the .eq("updated_at", ...) here is purely the
  // concurrency check, never an authorization mechanism.
  const { data, error } = await supabase
    .from("mortgage_scenarios")
    .update({
      name: prepared.name,
      schema_version: SCENARIO_SCHEMA_VERSION,
      calculator_version: CALCULATOR_VERSION,
      locale: prepared.locale,
      input_payload: prepared.payload,
      result_snapshot: prepared.resultSnapshot,
      market_references: prepared.marketReferences,
      calculated_at: prepared.calculatedAt,
    })
    .eq("id", input.id)
    .eq("user_id", user.id)
    .eq("updated_at", input.expectedUpdatedAt)
    .select("id");

  if (error) {
    logDatabaseError("updateScenario failed", error);
    return { ok: false, error: "database-error" };
  }
  if (data && data.length > 0) return { ok: true };

  // Zero rows updated — find out (best-effort) whether that's because the
  // row doesn't exist/isn't owned by this user, or because it exists but
  // updated_at has moved on since edit mode began.
  const { data: existing, error: checkError } = await supabase
    .from("mortgage_scenarios")
    .select("id")
    .eq("id", input.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (checkError) {
    logDatabaseError("updateScenario existence check failed", checkError);
    return { ok: false, error: "database-error" };
  }
  return { ok: false, error: existing ? "scenario-changed" : "not-found" };
}
