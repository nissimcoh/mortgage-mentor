import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Static source-text assertions (same convention as
 * lib/scenarios/__tests__/actions-source.test.ts) for the admin Server
 * Actions and their guard — this repo's plain `vitest run` setup has no
 * jsdom/live-Supabase, so the properties that matter for security (admin
 * access is re-checked on every call, self-delete is blocked, no
 * service-role key, only allowed error codes) are verified by reading the
 * compiled source as text.
 */
const here = dirname(fileURLToPath(import.meta.url));
const guardSource = readFileSync(join(here, "..", "guard.ts"), "utf8");
const actionsSource = readFileSync(join(here, "..", "actions.ts"), "utf8");
const contractSource = readFileSync(join(here, "..", "contract.ts"), "utf8");

describe("lib/admin/guard.ts — requireAdmin", () => {
  it("checks auth.getUser() before the is_current_user_admin RPC", () => {
    const authIndex = guardSource.indexOf("auth.getUser()");
    const rpcIndex = guardSource.indexOf('rpc(\n    "is_current_user_admin"');
    expect(authIndex).toBeGreaterThan(-1);
    expect(rpcIndex).toBeGreaterThan(-1);
    expect(authIndex).toBeLessThan(rpcIndex);
  });

  it("returns unauthenticated for a signed-out caller, before ever calling the admin RPC", () => {
    const returnIndex = guardSource.indexOf(
      'if (!user) return { ok: false, error: "unauthenticated" };',
    );
    const rpcIndex = guardSource.indexOf('rpc(\n    "is_current_user_admin"');
    expect(returnIndex).toBeGreaterThan(-1);
    expect(returnIndex).toBeLessThan(rpcIndex);
  });

  it("treats both an RPC error and a false result as forbidden — never assumes admin by default", () => {
    expect(guardSource).toMatch(/if \(error\) \{[\s\S]*?error: "forbidden"/);
    expect(guardSource).toMatch(
      /if \(isAdmin !== true\) return \{ ok: false, error: "forbidden" \};/,
    );
  });

  it("determines admin status via the database's own is_current_user_admin(), never a hardcoded email check in the app", () => {
    expect(guardSource).toMatch(/is_current_user_admin/);
    expect(guardSource).not.toMatch(/@gmail\.com/);
    expect(guardSource).not.toMatch(/ADMIN_EMAILS/);
  });

  it("never references a service-role or secret key", () => {
    expect(guardSource).not.toMatch(/service_role/i);
    expect(guardSource).not.toMatch(/SECRET_KEY/);
  });
});

function bodyOf(name: "adminDeleteScenario" | "adminDeleteUser"): string {
  const start = actionsSource.indexOf(`export async function ${name}`);
  expect(start, `${name} not found in actions.ts`).toBeGreaterThan(-1);
  const otherName =
    name === "adminDeleteScenario" ? "adminDeleteUser" : "adminDeleteScenario";
  const otherIndex = actionsSource.indexOf(
    `export async function ${otherName}`,
    start + 1,
  );
  const end = otherIndex > start ? otherIndex : actionsSource.length;
  return actionsSource.slice(start, end);
}

describe("lib/admin/actions.ts — both deletion actions require ownership", () => {
  for (const name of ["adminDeleteScenario", "adminDeleteUser"] as const) {
    it(`${name} calls requireOwner() before anything else, and returns its failure directly`, () => {
      const body = bodyOf(name);
      const guardIndex = body.indexOf("requireOwner()");
      const rpcIndex = body.indexOf(".rpc(");
      expect(guardIndex).toBeGreaterThan(-1);
      expect(rpcIndex).toBeGreaterThan(-1);
      expect(guardIndex).toBeLessThan(rpcIndex);
      expect(body).toMatch(/if \(!guard\.ok\) return guard;/);
    });

    it(`${name} validates the target id (isUuidLike) before calling any RPC`, () => {
      const body = bodyOf(name);
      const validateIndex = body.indexOf("isUuidLike(id)");
      const rpcIndex = body.indexOf(".rpc(");
      expect(validateIndex).toBeGreaterThan(-1);
      expect(validateIndex).toBeLessThan(rpcIndex);
    });
  }

  it("adminDeleteScenario calls the admin_delete_scenario RPC with target_id", () => {
    const body = bodyOf("adminDeleteScenario");
    expect(body).toMatch(/\.rpc\("admin_delete_scenario", \{\s*target_id: id,?\s*\}\)/);
  });

  it("adminDeleteUser refuses to delete the caller's own account before calling the RPC", () => {
    const body = bodyOf("adminDeleteUser");
    const selfCheckIndex = body.indexOf("id === guard.user.id");
    const rpcIndex = body.indexOf(".rpc(");
    expect(selfCheckIndex).toBeGreaterThan(-1);
    expect(selfCheckIndex).toBeLessThan(rpcIndex);
    expect(body).toMatch(/error: "cannot-delete-self"/);
  });

  it("adminDeleteUser calls the admin_delete_user RPC with target_user_id", () => {
    const body = bodyOf("adminDeleteUser");
    expect(body).toMatch(
      /\.rpc\("admin_delete_user", \{\s*target_user_id: id,?\s*\}\)/,
    );
  });

  it("never references a service-role or secret key", () => {
    expect(actionsSource).not.toMatch(/service_role/i);
    expect(actionsSource).not.toMatch(/SECRET_KEY/);
  });

  it("logs only a bounded diagnostic, never database messages or private details", () => {
    expect(actionsSource).toContain('.test(error.code) ? error.code : "REQUEST"');
    expect(actionsSource).not.toMatch(/message:\s*error\.message/);
    expect(actionsSource).not.toMatch(/hint:\s*error\.hint/);
    expect(actionsSource).not.toMatch(/console\.error\([^)]*,\s*error\)/);
  });
});

describe("lib/admin/contract.ts — safe, closed error set", () => {
  it("only defines the expected admin error codes", () => {
    const matches = [...contractSource.matchAll(/"([a-z-]+)"/g)].map(
      (m) => m[1],
    );
    const allowed = [
      "unauthenticated",
      "forbidden",
      "invalid-id",
      "cannot-delete-self",
      "database-error",
    ];
    expect(matches.length).toBeGreaterThan(0);
    for (const code of matches) {
      expect(allowed, `unexpected admin error code "${code}"`).toContain(
        code,
      );
    }
  });
});
