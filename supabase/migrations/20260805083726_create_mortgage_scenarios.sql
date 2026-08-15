-- Saved mortgage calculator scenarios.
--
-- input_payload is the source of truth: the exact TrackDraft[]-shaped
-- payload (schemaVersion + tracks) needed to reproduce this scenario in
-- the calculator, in the same shape the app already serializes to/from
-- the URL query string. Renaming, duplicating, and reopening a scenario
-- all operate on this column.
--
-- result_snapshot is a historical snapshot/cache of what input_payload
-- computed to at calculated_at — it is NOT the source of truth. It exists
-- so the saved-scenarios list can render instantly without recalculating,
-- and so a user can still see what a scenario computed to even if a
-- pinned market snapshot later becomes unavailable or engine methodology
-- changes. Always recompute from input_payload for current numbers.
--
-- market_references records which curve/Makam snapshot IDs (and the BOI
-- rate) were used to produce result_snapshot, for auditability and for
-- detecting when a live recalculation would differ from the stored
-- snapshot.
--
-- No sensitive personal profile data is stored here or anywhere in this
-- table: no ID number, salary, bank, or address — only what's needed to
-- reproduce and label a mortgage scenario, plus the owning user's id.

create extension if not exists pgcrypto;

create table if not exists public.mortgage_scenarios (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  name               text not null,
  schema_version     integer not null,
  calculator_version text not null,
  locale             text not null,
  input_payload      jsonb not null,
  result_snapshot    jsonb not null,
  market_references  jsonb not null,
  calculated_at      timestamptz not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint mortgage_scenarios_name_length
    check (char_length(btrim(name)) between 1 and 120),
  constraint mortgage_scenarios_schema_version_positive
    check (schema_version >= 1),
  constraint mortgage_scenarios_locale_valid
    check (locale in ('he', 'en')),
  constraint mortgage_scenarios_input_payload_is_object
    check (jsonb_typeof(input_payload) = 'object'),
  constraint mortgage_scenarios_result_snapshot_is_object
    check (jsonb_typeof(result_snapshot) = 'object'),
  constraint mortgage_scenarios_market_references_is_object
    check (jsonb_typeof(market_references) = 'object')
);

comment on table public.mortgage_scenarios is
  'Saved mortgage calculator scenarios. input_payload is the source of truth (reproduces the scenario in the calculator); result_snapshot is a historical cache of computed results, not authoritative; market_references records which curve/Makam data produced result_snapshot. No sensitive personal profile data is stored.';
comment on column public.mortgage_scenarios.input_payload is
  'Source of truth: TrackDraft[]-shaped payload (schemaVersion + tracks) that reproduces this scenario in the calculator.';
comment on column public.mortgage_scenarios.result_snapshot is
  'Historical snapshot/cache of computed results as of calculated_at. Not the source of truth — recompute from input_payload for current numbers.';
comment on column public.mortgage_scenarios.market_references is
  'Curve/Makam snapshot IDs (and BOI rate) used to produce result_snapshot, for auditability and staleness detection against a fresh calculation.';

-- Powers the /saved list query: a user's scenarios, newest-first.
create index if not exists mortgage_scenarios_user_updated_idx
  on public.mortgage_scenarios (user_id, updated_at desc);

-- search_path pinned to '' per Supabase's function-hardening guidance;
-- pg_catalog (and so now()) stays reachable regardless of search_path.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists mortgage_scenarios_set_updated_at on public.mortgage_scenarios;
create trigger mortgage_scenarios_set_updated_at
  before update on public.mortgage_scenarios
  for each row execute function public.set_updated_at();

-- Row Level Security is the real enforcement boundary for this table —
-- every mutation from the app runs through a Supabase client bound to the
-- caller's own session cookies, so the query executes as the
-- `authenticated` role with `auth.uid()` set to that user's id. No
-- service-role/secret key is used anywhere in this app, and no policy is
-- defined for the `anon` role: with RLS enabled and no matching anon
-- policy, anonymous requests get zero rows and zero mutations by default.
alter table public.mortgage_scenarios enable row level security;

-- create policy has no "if not exists" form in PostgreSQL, so a bare
-- create policy would fail on a second run of this migration; drop-then-
-- create is what makes this file safely re-runnable like the rest of it.
drop policy if exists "select own scenarios" on public.mortgage_scenarios;
create policy "select own scenarios"
  on public.mortgage_scenarios
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "insert own scenarios" on public.mortgage_scenarios;
create policy "insert own scenarios"
  on public.mortgage_scenarios
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "update own scenarios" on public.mortgage_scenarios;
create policy "update own scenarios"
  on public.mortgage_scenarios
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "delete own scenarios" on public.mortgage_scenarios;
create policy "delete own scenarios"
  on public.mortgage_scenarios
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
