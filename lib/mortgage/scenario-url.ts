/**
 * URL helpers for the two-scenario comparison page (/compare).
 *
 * Pure TypeScript, no React. Sits alongside `scenario-form.ts` but is a
 * distinct concern: `scenario-form.ts` owns ONE scenario's URL shape
 * (`track1Amount`, ...); this module namespaces that shape for TWO
 * scenarios sharing one page ("a"/"b" prefixes) and handles turning an
 * arbitrary pasted calculator link into something `parseTracksFromQuery`
 * already knows how to read. It never reimplements track serialization —
 * it wraps `applyTracksToQuery`/`parseTracksFromQuery` from `scenario-form.ts`.
 */

import { applyTracksToQuery, type TrackDraft } from "./scenario-form";

export type ScenarioSide = "a" | "b";

/**
 * Turn a pasted value into a `URLSearchParams` ready for
 * `parseTracksFromQuery`. Accepts:
 * - a full URL from this app or any other origin (only the query string is
 *   ever read — the hostname is never checked as a condition of validity)
 * - a bare query string, with or without a leading "?"
 *
 * Returns `null` only for empty/whitespace-only input. Anything else is
 * handed to `URLSearchParams` and left for the real validity check
 * downstream (`parseTracksFromQuery` returning `null` for content that
 * isn't recognizable track data) — this function's only job is extracting
 * the query string, not judging whether it's a valid scenario.
 */
export function parsePastedCalculatorLink(raw: string): URLSearchParams | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  try {
    // A full/absolute URL — from this app or elsewhere. Only `.search` is
    // ever used; the origin/pathname are irrelevant to validity.
    const url = new URL(trimmed);
    return new URLSearchParams(url.search);
  } catch {
    // Not an absolute URL — fall through to bare-query-string handling.
  }

  const queryPart = trimmed.startsWith("?") ? trimmed.slice(1) : trimmed;
  if (queryPart === "") return null;
  return new URLSearchParams(queryPart);
}

/**
 * Strips a scenario prefix ("a"/"b") from every matching key and lowercases
 * its first letter, e.g. `aTrack1Amount` -> `track1Amount`,
 * `aTrackCount` -> `trackCount` — exactly the shape `parseTracksFromQuery`
 * already reads. Keys not starting with `{prefix}{UppercaseLetter}` are
 * ignored, so this never accidentally captures an unrelated param.
 *
 * Used only for reading the compare page's OWN previously-shared URL
 * (`/compare?aTrackCount=...&bTrackCount=...`) — a freshly pasted
 * calculator link is already in the plain `track1Amount` shape and goes
 * straight to `parseTracksFromQuery`, no prefix involved.
 */
export function extractScenarioQueryParams(
  params: URLSearchParams,
  prefix: ScenarioSide,
): URLSearchParams {
  const result = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (!key.startsWith(prefix) || key.length <= prefix.length) continue;
    const rest = key.slice(prefix.length);
    if (!/^[A-Z]/.test(rest)) continue;
    const unprefixed = rest[0].toLowerCase() + rest.slice(1);
    result.set(unprefixed, value);
  }
  return result;
}

/**
 * Serializes one scenario's drafts into a-or-b-prefixed params (via the
 * real `applyTracksToQuery` serialization, never re-derived), ready to
 * merge into the compare page's own URL — the inverse of
 * `extractScenarioQueryParams`.
 */
export function buildScenarioQueryString(
  drafts: TrackDraft[],
  prefix: ScenarioSide,
): string {
  const plain = applyTracksToQuery(new URLSearchParams(), drafts);
  const prefixed = new URLSearchParams();
  for (const [key, value] of plain.entries()) {
    const capitalized = key[0].toUpperCase() + key.slice(1);
    prefixed.set(`${prefix}${capitalized}`, value);
  }
  return prefixed.toString();
}
