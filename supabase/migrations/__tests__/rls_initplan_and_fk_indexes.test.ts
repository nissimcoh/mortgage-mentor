import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

/** Static text assertions, same convention as the other migration tests:
 * the rewritten policy must keep the owner-only rule, only in InitPlan form. */
const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, "..", "20261101120000_rls_initplan_and_fk_indexes.sql"), "utf8");

it("keeps the cross-user scenario read owner-only, evaluated once per statement", () => {
  expect(sql).toMatch(/for select to authenticated using \(\(select public\.is_current_user_owner\(\)\)\);/);
  expect(sql).not.toMatch(/is_current_user_admin/);
  expect(sql).not.toMatch(/\banon\b|service_role/);
});

it("indexes every auth.users foreign key on the role tables", () => {
  expect(sql).toMatch(/on public\.user_roles \(updated_by\)/);
  expect(sql).toMatch(/on public\.user_role_events \(actor_id\)/);
  expect(sql).toMatch(/on public\.user_role_events \(target_user_id\)/);
});
