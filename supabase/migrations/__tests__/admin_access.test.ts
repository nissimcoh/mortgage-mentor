import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Static text assertions against the admin-access migration SQL — same
 * convention as create_mortgage_scenarios.test.ts: this repo's plain
 * `vitest run` setup can't execute real DDL/RLS, so these tests exist to
 * catch an edit that silently weakens the admin check (e.g. a new admin
 * RPC that forgets to re-verify is_current_user_admin(), or a grant that
 * accidentally reaches anon/service_role), not to prove the SQL is valid
 * Postgres — that's verified by actually applying it.
 */
const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(here, "..", "20260916120000_admin_access.sql"),
  "utf8",
);

function bodyOfFunction(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}`);
  expect(start, `${name} not found in admin_access.sql`).toBeGreaterThan(-1);
  const end = sql.indexOf("\n$$;", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe("is_current_user_admin", () => {
  const body = bodyOfFunction("is_current_user_admin()");

  it("checks the caller's own JWT email, never a caller-supplied value", () => {
    expect(body).toMatch(/auth\.jwt\(\) ->> 'email'/);
  });

  it("checks against a hardcoded, version-controlled email list, not an env var or table lookup", () => {
    expect(body).toMatch(/= any \(array\[/);
    expect(body).toMatch(/'nissssssim@gmail\.com'/);
  });

  it("is a plain read-only check (stable, security invoker) — it doesn't need elevated privileges to read the caller's own JWT", () => {
    expect(sql).toMatch(
      /create or replace function public\.is_current_user_admin\(\)[\s\S]*?stable[\s\S]*?security invoker/,
    );
  });

  it("is pinned to an empty search_path, per Supabase's function-hardening guidance", () => {
    expect(sql).toMatch(
      /create or replace function public\.is_current_user_admin\(\)[\s\S]*?set search_path = ''/,
    );
  });

  it("is never callable by anon or service_role", () => {
    expect(sql).not.toMatch(/is_current_user_admin\(\)[\s\S]{0,80}to anon/);
    expect(sql).not.toMatch(/service_role/i);
  });
});

describe("admins can select all scenarios (RLS)", () => {
  it("extends (never replaces) the existing per-owner select policy", () => {
    expect(sql).toMatch(
      /drop policy if exists "admins can select all scenarios" on public\.mortgage_scenarios;\s*create policy "admins can select all scenarios"[\s\S]*?for select[\s\S]*?to authenticated[\s\S]*?using \(public\.is_current_user_admin\(\)\)/,
    );
    // The original per-owner policy from the first migration must be
    // untouched by this file — this migration only ADDS a policy.
    expect(sql).not.toMatch(/drop policy if exists "select own scenarios"/);
  });
});

for (const [fnName, declSignature] of [
  ["admin_list_users", "admin_list_users()"],
  ["admin_list_scenarios", "admin_list_scenarios()"],
  ["admin_delete_scenario", "admin_delete_scenario(target_id uuid)"],
  ["admin_delete_user", "admin_delete_user(target_user_id uuid)"],
] as const) {
  describe(`${fnName} — admin-only RPC`, () => {
    const body = bodyOfFunction(declSignature);

    it("re-checks is_current_user_admin() itself, before doing anything else — never trusts the caller reached it only via the admin UI", () => {
      const checkIndex = body.indexOf("is_current_user_admin()");
      expect(checkIndex).toBeGreaterThan(-1);
      expect(body).toMatch(/if not public\.is_current_user_admin\(\) then\s*\n\s*raise exception/);
    });

    it("runs as security definer with an empty search_path", () => {
      expect(sql).toMatch(
        new RegExp(
          `create or replace function public\\.${fnName}\\([^)]*\\)[\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`,
        ),
      );
    });

    it("is revoked from public and granted only to authenticated", () => {
      expect(sql).toMatch(
        new RegExp(`revoke all on function public\\.${fnName}\\([^)]*\\) from public;`),
      );
      expect(sql).toMatch(
        new RegExp(`grant execute on function public\\.${fnName}\\([^)]*\\) to authenticated;`),
      );
    });
  });
}

describe("admin_list_users — never exposes auth secrets", () => {
  const body = bodyOfFunction("admin_list_users()");

  it("returns only display-safe columns, never encrypted_password or raw tokens", () => {
    expect(body).toMatch(
      /select u\.id, u\.email, u\.created_at, u\.last_sign_in_at, u\.email_confirmed_at/,
    );
    expect(body).not.toMatch(/encrypted_password/);
    expect(body).not.toMatch(/token/i);
  });
});

describe("admin_delete_user — cannot be used to lock out the only admin", () => {
  const body = bodyOfFunction("admin_delete_user(target_user_id uuid)");

  it("refuses to delete the caller's own account", () => {
    expect(body).toMatch(
      /if target_user_id = \(select auth\.uid\(\)\) then\s*\n\s*raise exception/,
    );
  });

  it("checks the self-delete guard before actually deleting", () => {
    const selfCheckIndex = body.indexOf("target_user_id = (select auth.uid())");
    const deleteIndex = body.indexOf("delete from auth.users");
    expect(selfCheckIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(selfCheckIndex);
  });
});

describe("no service-role key introduced anywhere", () => {
  it("the whole migration never references service_role or a secret key", () => {
    expect(sql).not.toMatch(/service_role/i);
    expect(sql).not.toMatch(/SECRET_KEY/);
  });
});
