import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Static text assertions, like the other migration tests: no live database. */
const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, "..", "20261117210000_create_existing_mortgages.sql"), "utf8");

describe("existing_mortgages migration", () => {
  it("keys one row per user, removed with the account", () => {
    expect(sql).toMatch(/user_id\s+uuid primary key references auth\.users\(id\) on delete cascade/);
    expect(sql).toMatch(/loans\s+jsonb not null/);
    expect(sql).toMatch(/jsonb_typeof\(loans\) = 'array'/);
    expect(sql).toMatch(/octet_length\(loans::text\) <= 200000/);
  });

  it("enables RLS with an owner-only policy for every operation", () => {
    expect(sql).toMatch(/alter table public\.existing_mortgages enable row level security/);
    for (const operation of ["select", "insert", "update", "delete"]) {
      expect(sql).toMatch(new RegExp(`for ${operation}\\s+to authenticated`));
    }
    // Every ownership check uses the initplan-friendly (select auth.uid()) form.
    expect(sql.match(/auth\.uid\(\)/g)?.length).toBe(sql.match(/\(select auth\.uid\(\)\) = user_id/g)?.length);
    expect(sql).not.toMatch(/to anon|to public/);
  });

  it("keeps updated_at current", () => {
    expect(sql).toMatch(/before update on public\.existing_mortgages/);
    expect(sql).toMatch(/execute function public\.set_updated_at\(\)/);
  });
});
