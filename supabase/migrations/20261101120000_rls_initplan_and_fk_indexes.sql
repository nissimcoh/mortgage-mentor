-- Performance only; who can read what is unchanged.
--
-- A bare function call in a policy is re-evaluated for every candidate row.
-- Wrapped in a scalar subquery, Postgres runs it once per statement as an
-- InitPlan (the same form the "own scenarios" policies use for auth.uid()).
drop policy if exists "admins can select all scenarios" on public.mortgage_scenarios;
create policy "admins can select all scenarios" on public.mortgage_scenarios
  for select to authenticated using ((select public.is_current_user_owner()));

-- Foreign keys to auth.users with "on delete set null": without an index,
-- deleting an account scans these tables to find the rows to null out.
create index if not exists user_roles_updated_by_idx on public.user_roles (updated_by);
create index if not exists user_role_events_actor_id_idx on public.user_role_events (actor_id);
create index if not exists user_role_events_target_user_id_idx on public.user_role_events (target_user_id);
