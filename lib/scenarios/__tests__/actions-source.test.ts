import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Static source-text assertions, not a live-database test — this repo's
 * test setup (plain `vitest run`, no jsdom, no local Postgres/Docker)
 * can't exercise real auth/RLS. lib/scenarios/actions.ts's actual
 * ownership enforcement is the already-verified remote RLS migration
 * (see supabase/migrations/__tests__); these tests exist to catch a
 * future edit that accidentally trusts a caller-supplied user_id, skips
 * the auth check, or leaks a raw database error to the client — none of
 * which any amount of RLS testing would catch here.
 */
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "..", "actions.ts"), "utf8");

const ACTION_NAMES = [
  "createScenario",
  "deleteScenario",
  "renameScenario",
  "duplicateScenario",
] as const;

function bodyOf(name: (typeof ACTION_NAMES)[number]): string {
  const start = source.indexOf(`export async function ${name}`);
  expect(start, `${name} not found in actions.ts`).toBeGreaterThan(-1);
  const nextIndex = ACTION_NAMES.map((other) =>
    other === name ? Infinity : source.indexOf(`export async function ${other}`, start + 1),
  ).filter((index) => index > start);
  const end = nextIndex.length > 0 ? Math.min(...nextIndex) : source.length;
  return source.slice(start, end);
}

describe("lib/scenarios/actions.ts — auth boundary", () => {
  it("checks auth.getUser() before any database call in all four actions", () => {
    for (const name of ACTION_NAMES) {
      const body = bodyOf(name);
      const authCheckIndex = body.indexOf("auth.getUser()");
      const firstDbCallIndex = body.indexOf('.from("mortgage_scenarios")');
      expect(authCheckIndex, `${name}: missing auth.getUser()`).toBeGreaterThan(-1);
      expect(firstDbCallIndex, `${name}: missing a mortgage_scenarios call`).toBeGreaterThan(-1);
      expect(authCheckIndex, `${name}: auth check must precede the db call`).toBeLessThan(
        firstDbCallIndex,
      );
    }
  });

  it("rejects unauthenticated callers in all four actions instead of proceeding", () => {
    const matches = source.match(/if \(!user\) return \{ ok: false, error: "unauthenticated" \};/g);
    expect(matches?.length).toBe(ACTION_NAMES.length);
  });

  it("sets user_id from the authenticated session, never from the caller's input", () => {
    expect(source).toMatch(/user_id:\s*user\.id/);
    // No action signature accepts a userId/user_id from the caller.
    expect(source).not.toMatch(/userId/);
    expect(source).not.toMatch(/input\.user_id/);
  });

  it("scopes delete, rename, and duplicate's load to the authenticated user's own id (defense-in-depth on top of RLS)", () => {
    for (const name of ["deleteScenario", "renameScenario", "duplicateScenario"] as const) {
      const body = bodyOf(name);
      expect(body, `${name} missing .eq("user_id", user.id)`).toMatch(
        /\.eq\("user_id", user\.id\)/,
      );
    }
  });

  it("never references a service-role or secret key", () => {
    expect(source).not.toMatch(/service_role/i);
    expect(source).not.toMatch(/SECRET_KEY/);
  });
});

describe("lib/scenarios/actions.ts — createScenario never trusts client math", () => {
  it("re-derives result_snapshot from a fresh server-side calculation rather than trusting a client-supplied summary", () => {
    expect(source).toMatch(/calculateScenarioSummary/);
    expect(source).toMatch(/buildResultSnapshot\(inputs, summary\)/);
    // The exported input type never accepts a pre-computed snapshot/summary.
    expect(source).not.toMatch(/resultSnapshot: unknown/);
    expect(source).not.toMatch(/summary: unknown/);
  });
});

describe("lib/scenarios/actions.ts — renameScenario", () => {
  it("validates the name before updating, and changes only name (updated_at comes from the db trigger)", () => {
    const body = bodyOf("renameScenario");
    expect(body).toMatch(/validateScenarioName\(input\.name\)/);
    expect(body).toMatch(/\.update\(\{ name \}\)/);
    // Never writes input_payload/result_snapshot/market_references here.
    expect(body).not.toMatch(/input_payload:/);
    expect(body).not.toMatch(/result_snapshot:/);
    expect(body).not.toMatch(/market_references:/);
  });
});

describe("lib/scenarios/actions.ts — duplicateScenario", () => {
  const body = bodyOf("duplicateScenario");

  it("loads the source row through the caller's own RLS-bound client before copying anything", () => {
    expect(body).toMatch(/\.select\(/);
    expect(body).toMatch(/\.maybeSingle\(\)/);
  });

  it("validates all three JSON columns before propagating them into the new row", () => {
    expect(body).toMatch(/validateInputPayload\(source\.input_payload\)/);
    expect(body).toMatch(/isValidResultSnapshot\(source\.result_snapshot\)/);
    expect(body).toMatch(/isValidMarketReferences\(source\.market_references\)/);
  });

  it("creates a new row via insert, built by the pure buildDuplicateRow helper, adding only user_id", () => {
    expect(body).toMatch(/buildDuplicateRow\(\{/);
    expect(body).toMatch(/\.insert\(\{\s*\.\.\.row,\s*user_id:\s*user\.id\s*\}\)/);
    // The insert payload must not set an explicit id — the table's own
    // gen_random_uuid() default (and buildDuplicateRow's own contract,
    // tested directly in payload.test.ts) is what makes this a distinct
    // new row, never a copy of the source row's identity.
    expect(body).not.toMatch(/\bid:\s*source\.id/);
    expect(body).not.toMatch(/id:\s*id\b/);
  });
});

describe("lib/scenarios/actions.ts — safe error contract", () => {
  const ALLOWED_ERROR_CODES = [
    "unauthenticated",
    "invalid-name",
    "invalid-scenario",
    "not-found",
    "database-error",
  ];

  it("only ever returns error codes from the stable allowed set", () => {
    const matches = [...source.matchAll(/error:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(matches.length).toBeGreaterThan(0);
    for (const code of matches) {
      expect(ALLOWED_ERROR_CODES, `unexpected error code "${code}"`).toContain(code);
    }
  });

  it("never returns a raw database error's message/details to the caller", () => {
    // Every `{ ok: false, ... }` literal must use one of the allowed
    // string codes, never error.message/error.details/String(error) etc.
    expect(source).not.toMatch(/error:\s*error\.message/);
    expect(source).not.toMatch(/error:\s*error\.details/);
    expect(source).not.toMatch(/error:\s*String\(error\)/);
    expect(source).not.toMatch(/error:\s*error\}/);
  });

  it("logs only named safe fields (code/message/hint), never the whole error object, and never a session/token", () => {
    const helperStart = source.indexOf("function logDatabaseError");
    const helperEnd = source.indexOf("\n}", helperStart) + 2;
    const helperBody = source.slice(helperStart, helperEnd);
    expect(helperBody).toMatch(/code:\s*error\.code/);
    expect(helperBody).toMatch(/message:\s*error\.message/);
    expect(helperBody).toMatch(/hint:\s*error\.hint/);
    // Never interpolates the whole error object or the user/session.
    expect(helperBody).not.toMatch(/console\.error\([^)]*,\s*error\)/);
    expect(source).not.toMatch(/console\.(log|error|warn)\([^)]*session/i);
    expect(source).not.toMatch(/console\.(log|error|warn)\([^)]*\btoken\b/i);
  });
});
