import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * These are static text assertions against the migration SQL, not a live
 * database test — this repo's test setup (plain `vitest run`, no jsdom,
 * no local Postgres) can't execute real DDL/RLS. They exist to catch a
 * migration edit that silently drops a column, a policy, or a constraint,
 * not to prove the SQL is valid Postgres (that's verified by actually
 * applying it, per the manual QA process).
 */
const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(here, "..", "20260805083726_create_mortgage_scenarios.sql"),
  "utf8",
);

describe("mortgage_scenarios migration", () => {
  it("creates the table with every required column", () => {
    expect(sql).toMatch(
      /create table if not exists public\.mortgage_scenarios/,
    );
    const requiredColumns = [
      "id",
      "user_id",
      "name",
      "schema_version",
      "calculator_version",
      "locale",
      "input_payload",
      "result_snapshot",
      "market_references",
      "calculated_at",
      "created_at",
      "updated_at",
    ];
    for (const column of requiredColumns) {
      expect(sql).toMatch(new RegExp(`\\b${column}\\b`));
    }
  });

  it("references auth.users with cascade delete for user_id", () => {
    expect(sql).toMatch(
      /user_id\s+uuid not null references auth\.users\(id\) on delete cascade/,
    );
  });

  it("enables row level security", () => {
    expect(sql).toMatch(
      /alter table public\.mortgage_scenarios enable row level security/,
    );
  });

  it("defines all four authenticated ownership policies", () => {
    expect(sql).toMatch(
      /create policy "select own scenarios"[\s\S]*?to authenticated[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id\)/,
    );
    expect(sql).toMatch(
      /create policy "insert own scenarios"[\s\S]*?to authenticated[\s\S]*?with check \(\(select auth\.uid\(\)\) = user_id\)/,
    );
    expect(sql).toMatch(
      /create policy "update own scenarios"[\s\S]*?to authenticated[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id\)[\s\S]*?with check \(\(select auth\.uid\(\)\) = user_id\)/,
    );
    expect(sql).toMatch(
      /create policy "delete own scenarios"[\s\S]*?to authenticated[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id\)/,
    );
  });

  it("is safely re-runnable: each policy is dropped (if exists) before being recreated", () => {
    // create policy has no "if not exists" form in PostgreSQL, unlike the
    // table/index/function/trigger statements elsewhere in this file — a
    // bare create policy would fail on a second run. Each of the four
    // policies must have a matching drop-if-exists immediately before it.
    for (const policyName of [
      "select own scenarios",
      "insert own scenarios",
      "update own scenarios",
      "delete own scenarios",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `drop policy if exists "${policyName}" on public\\.mortgage_scenarios;\\s*create policy "${policyName}"`,
        ),
      );
    }
  });

  it("grants no anonymous or service_role access", () => {
    expect(sql).not.toMatch(/\bto anon\b/);
    expect(sql).not.toMatch(/service_role/i);
  });

  it("enforces a trimmed name length between 1 and 120 characters", () => {
    expect(sql).toMatch(/char_length\(btrim\(name\)\) between 1 and 120/);
  });

  it("enforces schema_version and locale constraints", () => {
    expect(sql).toMatch(/schema_version >= 1/);
    expect(sql).toMatch(/locale in \('he', 'en'\)/);
  });

  it("enforces input_payload, result_snapshot, and market_references are JSON objects", () => {
    for (const column of [
      "input_payload",
      "result_snapshot",
      "market_references",
    ]) {
      expect(sql).toMatch(
        new RegExp(`jsonb_typeof\\(${column}\\) = 'object'`),
      );
    }
  });

  it("indexes user_id + updated_at for newest-first listing", () => {
    expect(sql).toMatch(
      /create index if not exists mortgage_scenarios_user_updated_idx\s+on public\.mortgage_scenarios \(user_id, updated_at desc\)/,
    );
  });

  it("has an updated_at trigger wired to a search_path-pinned function", () => {
    expect(sql).toMatch(/create or replace function public\.set_updated_at\(\)/);
    expect(sql).toMatch(/set search_path = ''/);
    expect(sql).toMatch(
      /create trigger mortgage_scenarios_set_updated_at\s+before update on public\.mortgage_scenarios/,
    );
  });

  it("documents input_payload as source of truth and result_snapshot as a non-authoritative cache", () => {
    expect(sql).toMatch(/input_payload is the source of truth/);
    expect(sql).toMatch(/result_snapshot is a historical (cache|snapshot\/cache)/);
    expect(sql).toMatch(/no sensitive personal profile data/i);
  });
});
