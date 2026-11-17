import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Static text assertions, like the other migration tests: no live database. */
const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, "..", "20261117230000_payoff_report_reads.sql"), "utf8");

describe("payoff_report_reads migration", () => {
  it("records who and when only, removed with the account", () => {
    expect(sql).toMatch(/user_id\s+uuid not null references auth\.users\(id\) on delete cascade/);
    expect(sql).toMatch(/read_at\s+timestamptz not null default now\(\)/);
    const columns = sql.slice(sql.indexOf("create table"), sql.indexOf(");")).match(/^\s{2}(\w+)\s/gm);
    expect(columns?.map((column) => column.trim())).toEqual(["id", "user_id", "read_at"]);
  });

  it("lets users read their own rows and nobody write except the function", () => {
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/for select\s+to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\)/);
    expect(sql).not.toMatch(/for (insert|update|delete)/);
  });

  it("claims atomically, with ceilings callers cannot raise", () => {
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path = ''/);
    expect(sql).toMatch(/pg_advisory_xact_lock/);
    expect(sql).toMatch(/least\(greatest\(coalesce\(user_limit, 0\), 0\), 50\)/);
    expect(sql).toMatch(/least\(greatest\(coalesce\(site_limit, 0\), 0\), 1000\)/);
    expect(sql).toMatch(/interval '24 hours'/);
    // The site-wide cap is checked before the caller's own.
    expect(sql.indexOf("'site-limit'")).toBeLessThan(sql.indexOf("'user-limit'"));
    expect(sql).toMatch(/revoke all on function public\.claim_payoff_report_read\(integer, integer\) from public/);
    expect(sql).toMatch(/grant execute on function public\.claim_payoff_report_read\(integer, integer\) to authenticated/);
  });
});
