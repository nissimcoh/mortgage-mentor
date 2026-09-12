import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Static source-text assertions (same convention as actions-source.test.ts)
 * for app/[locale]/calculator/page.tsx's resolveEditContext — this repo's
 * plain `vitest run` setup has no jsdom/live-Supabase, so the properties
 * that matter for security (auth precedes the query, ownership is
 * enforced, no service-role, the client never receives the raw URL name/
 * timestamp as if they were trusted) are verified by reading the compiled
 * source as text rather than by executing it.
 */
const here = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(
  join(here, "..", "..", "..", "app", "[locale]", "calculator", "page.tsx"),
  "utf8",
);

function bodyOfResolveEditContext(): string {
  const start = pageSource.indexOf("async function resolveEditContext");
  expect(start, "resolveEditContext not found in calculator/page.tsx").toBeGreaterThan(-1);
  const end = pageSource.indexOf("\nexport async function generateMetadata", start);
  expect(end).toBeGreaterThan(start);
  return pageSource.slice(start, end);
}

describe("calculator/page.tsx — resolveEditContext auth boundary", () => {
  const body = bodyOfResolveEditContext();

  it("checks auth.getUser() before ever querying mortgage_scenarios", () => {
    const authCheckIndex = body.indexOf("auth.getUser()");
    const dbCallIndex = body.indexOf('.from("mortgage_scenarios")');
    expect(authCheckIndex).toBeGreaterThan(-1);
    expect(dbCallIndex).toBeGreaterThan(-1);
    expect(authCheckIndex).toBeLessThan(dbCallIndex);
  });

  it("returns null immediately for a signed-out caller, before the db call", () => {
    const signedOutReturnIndex = body.indexOf("if (!user) return null;");
    const dbCallIndex = body.indexOf('.from("mortgage_scenarios")');
    expect(signedOutReturnIndex).toBeGreaterThan(-1);
    expect(signedOutReturnIndex).toBeLessThan(dbCallIndex);
  });

  it("scopes the scenario query to both the requested id and the authenticated user's own id (RLS defense-in-depth)", () => {
    expect(body).toMatch(/\.eq\("id", savedScenarioIdParam\)/);
    expect(body).toMatch(/\.eq\("user_id", user\.id\)/);
  });

  it("never references a service-role or secret key", () => {
    expect(body).not.toMatch(/service_role/i);
    expect(body).not.toMatch(/SECRET_KEY/);
  });

  it("only a syntactically valid id (extractSavedScenarioIdParam) is ever sent to the query — a malformed id short-circuits first", () => {
    const extractIndex = body.indexOf("extractSavedScenarioIdParam(query)");
    const guardIndex = body.indexOf("if (!savedScenarioIdParam) return null;");
    const dbCallIndex = body.indexOf('.from("mortgage_scenarios")');
    expect(extractIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeGreaterThan(extractIndex);
    expect(guardIndex).toBeLessThan(dbCallIndex);
  });

  it("shapes the final result through buildTrustedEditContext(row) — never returns the raw row or a hand-built object", () => {
    expect(body).toMatch(/return buildTrustedEditContext\(row\);/);
  });

  it("never logs the whole error object, session, or a token", () => {
    expect(body).not.toMatch(/console\.error\([^)]*,\s*error\)/);
    expect(pageSource).not.toMatch(/console\.(log|error|warn)\([^)]*session/i);
    expect(pageSource).not.toMatch(/console\.(log|error|warn)\([^)]*\btoken\b/i);
  });
});

describe("calculator/page.tsx — the client never receives the URL's name/timestamp as trusted data", () => {
  it("never reads savedScenarioName or savedScenarioUpdatedAt from the incoming request at all", () => {
    // Even a still-bookmarked old-format link carrying these params must
    // be ignored outright — only savedScenarioId (a lookup key) is read.
    expect(pageSource).not.toMatch(/savedScenarioName/);
    expect(pageSource).not.toMatch(/savedScenarioUpdatedAt/);
  });

  it("passes MortgageCalculator a server-resolved editContext object, not raw query fields", () => {
    expect(pageSource).toMatch(/editContext=\{editContext\}/);
    expect(pageSource).toMatch(/editContextUnavailable=\{editContextUnavailable\}/);
  });

  it("derives editContextUnavailable from the resolved context, not by trusting the request on its own", () => {
    expect(pageSource).toMatch(
      /isEditContextUnavailable\(query, editContext\)/,
    );
  });
});

describe("calculator/page.tsx — MortgageCalculator remounts on edit-scenario identity change only", () => {
  // Regression coverage for a real lifecycle gap: MortgageCalculator
  // captures editContext once via a lazy useState initializer specifically
  // so a Server Component refresh for the SAME scenario can't silently
  // replace the captured optimistic-concurrency token. But that lazy
  // initializer only runs on mount — without a key tied to the trusted
  // scenario identity, navigating from editing scenario A straight to
  // scenario B (while the component instance is reused) would retain A's
  // stale editContext instead of capturing B's.
  it("derives MortgageCalculator's remount key from the trusted editContext via computeCalculatorInstanceKey", () => {
    expect(pageSource).toMatch(
      /const calculatorInstanceKey = computeCalculatorInstanceKey\(editContext\);/,
    );
  });

  it("passes that key to the MortgageCalculator element", () => {
    expect(pageSource).toMatch(/<MortgageCalculator\s*\n\s*key=\{calculatorInstanceKey\}/);
  });
});

describe("app/[locale]/saved/[scenarioId]/page.tsx — edit link carries only the lookup key", () => {
  const detailSource = readFileSync(
    join(
      here,
      "..",
      "..",
      "..",
      "app",
      "[locale]",
      "saved",
      "[scenarioId]",
      "page.tsx",
    ),
    "utf8",
  );

  it("sets savedScenarioId on the edit link, but no longer name/updatedAt — the calculator re-derives those itself", () => {
    expect(detailSource).toMatch(/editQuery\.set\("savedScenarioId", row\.id\)/);
    expect(detailSource).not.toMatch(/savedScenarioUpdatedAt/);
    expect(detailSource).not.toMatch(/savedScenarioName/);
  });
});

describe("components/MortgageCalculator.tsx — edit context comes from props, not URL parsing", () => {
  const componentSource = readFileSync(
    join(here, "..", "..", "..", "components", "MortgageCalculator.tsx"),
    "utf8",
  );

  it("never reads savedScenarioId/Name/UpdatedAt off searchParams.get(...) — only the trusted editContext prop is used", () => {
    expect(componentSource).not.toMatch(/searchParams\.get\("savedScenarioId"\)/);
    expect(componentSource).not.toMatch(/searchParams\.get\("savedScenarioName"\)/);
    expect(componentSource).not.toMatch(/searchParams\.get\("savedScenarioUpdatedAt"\)/);
  });

  it("captures the server-provided editContext once (lazy useState initializer), not on every render", () => {
    expect(componentSource).toMatch(
      /useState\(\(\) => \(\{\s*context: editContextFromServer,\s*unavailable: editContextUnavailable,\s*\}\)\)/,
    );
  });

  it("still allows exiting edit mode to clear any legacy name/updatedAt params from an old bookmarked link (cleanup only, never a read)", () => {
    expect(componentSource).toMatch(/query\.delete\("savedScenarioName"\)/);
    expect(componentSource).toMatch(/query\.delete\("savedScenarioUpdatedAt"\)/);
  });
});
