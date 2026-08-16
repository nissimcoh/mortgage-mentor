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
 * future edit that accidentally trusts a caller-supplied user_id or
 * skips the auth check, which no amount of RLS testing would catch here.
 */
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "..", "actions.ts"), "utf8");

describe("lib/scenarios/actions.ts", () => {
  it("checks auth.getUser() before any database call in both actions", () => {
    const createScenarioBody = source.slice(
      source.indexOf("export async function createScenario"),
      source.indexOf("export async function deleteScenario"),
    );
    const deleteScenarioBody = source.slice(
      source.indexOf("export async function deleteScenario"),
    );

    for (const body of [createScenarioBody, deleteScenarioBody]) {
      const authCheckIndex = body.indexOf("auth.getUser()");
      const firstDbCallIndex = body.indexOf('.from("mortgage_scenarios")');
      expect(authCheckIndex).toBeGreaterThan(-1);
      expect(firstDbCallIndex).toBeGreaterThan(-1);
      expect(authCheckIndex).toBeLessThan(firstDbCallIndex);
    }
  });

  it("rejects unauthenticated callers instead of proceeding", () => {
    expect(source).toMatch(/if \(!user\) return \{ ok: false, error: "unauthenticated" \};/);
  });

  it("sets user_id from the authenticated session, never from the caller's input", () => {
    expect(source).toMatch(/user_id:\s*user\.id/);
    // Neither action signature accepts a userId/user_id from the caller.
    expect(source).not.toMatch(/userId/);
    expect(source).not.toMatch(/input\.user_id/);
  });

  it("scopes delete to the authenticated user's own id as defense-in-depth, on top of RLS", () => {
    const deleteBody = source.slice(source.indexOf("export async function deleteScenario"));
    expect(deleteBody).toMatch(/\.delete\(\)/);
    expect(deleteBody).toMatch(/\.eq\("user_id", user\.id\)/);
  });

  it("never references a service-role or secret key", () => {
    expect(source).not.toMatch(/service_role/i);
    expect(source).not.toMatch(/SECRET_KEY/);
  });

  it("re-derives result_snapshot from a fresh server-side calculation rather than trusting a client-supplied summary", () => {
    expect(source).toMatch(/calculateScenarioSummary/);
    expect(source).toMatch(/buildResultSnapshot\(inputs, summary\)/);
    // The exported input type never accepts a pre-computed snapshot/summary.
    expect(source).not.toMatch(/resultSnapshot: unknown/);
    expect(source).not.toMatch(/summary: unknown/);
  });
});
