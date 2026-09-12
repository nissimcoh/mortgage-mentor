/**
 * Trusted edit-context resolution for the calculator's edit mode.
 *
 * savedScenarioId in the URL is only ever a lookup key, never proof of
 * ownership — the scenario's name and its optimistic-concurrency token
 * (updatedAt) must always come from a server-side, RLS-scoped row lookup
 * (see app/[locale]/calculator/page.tsx), never from other URL params.
 * This keeps the two purely-shaping steps (which id is even worth
 * looking up; what a returned row becomes) as plain, unit-testable
 * functions, matching this repo's established pure-function-test
 * convention — the actual Supabase auth/query calls stay inline in the
 * Server Component, where they're covered by source-text checks instead.
 */

import { isUuidLike } from "./payload";

export interface TrustedEditContext {
  id: string;
  name: string;
  updatedAt: string;
}

/**
 * Extracts a syntactically valid savedScenarioId from raw searchParams-
 * shaped query values. Returns null when the param is absent, multi-
 * valued, or not a well-formed UUID — a malformed value is never worth
 * sending to a uuid-typed database column.
 */
export function extractSavedScenarioIdParam(
  query: Record<string, string | string[] | undefined>,
): string | null {
  const raw = query.savedScenarioId;
  return typeof raw === "string" && isUuidLike(raw) ? raw : null;
}

/**
 * Shapes a trusted edit context strictly from a row already scoped to
 * the authenticated user (id + user_id both matched server-side). Never
 * reads name/updatedAt from anywhere else — in particular, never from
 * the browser-supplied savedScenarioName/savedScenarioUpdatedAt that
 * older/forged links may still carry. Returns null for a missing row or
 * one with an unexpectedly-shaped column.
 */
export function buildTrustedEditContext(
  row: { id: unknown; name: unknown; updated_at: unknown } | null | undefined,
): TrustedEditContext | null {
  if (!row) return null;
  if (
    typeof row.id !== "string" ||
    typeof row.name !== "string" ||
    typeof row.updated_at !== "string"
  ) {
    return null;
  }
  return { id: row.id, name: row.name, updatedAt: row.updated_at };
}

/**
 * Whether the "saved scenario couldn't be loaded for editing" notice
 * should show: only when the request actually asked for edit mode (a
 * savedScenarioId — even a malformed one — was present) but resolution
 * failed. Deliberately the SAME condition regardless of the underlying
 * reason (signed out, not found, malformed, owned by someone else) —
 * distinguishing those to the caller would leak which case occurred.
 */
export function isEditContextUnavailable(
  query: Record<string, string | string[] | undefined>,
  editContext: TrustedEditContext | null,
): boolean {
  return typeof query.savedScenarioId === "string" && editContext === null;
}

/**
 * The React key that forces MortgageCalculator to remount exactly when
 * the trusted edit-scenario identity changes — normal mode <-> editing,
 * or editing scenario A -> scenario B — so its lazy useState capture of
 * editContext (the optimistic-concurrency token) re-runs for the new
 * identity. Deliberately keyed on id alone: a recalculation or Server
 * Component refresh for the SAME scenario, or an external rename/update
 * to that same row changing its updatedAt, must reuse the same key and
 * must NOT remount — that's exactly what protects the originally
 * captured expectedUpdatedAt from being silently refreshed.
 */
export function computeCalculatorInstanceKey(
  editContext: TrustedEditContext | null,
): string {
  return editContext ? `edit:${editContext.id}` : "normal";
}
