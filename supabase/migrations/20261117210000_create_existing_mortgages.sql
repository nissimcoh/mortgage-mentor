-- The signed-in user's current mortgage, as confirmed from payoff reports
-- on /my-mortgage. One row per user: saving again replaces it.
--
-- loans holds the confirmed PayoffLoan[] (figures only: loan numbers,
-- balances, rates, dates and fees; no names, ID numbers or report files).
-- Forecast results are not stored; the page recomputes them from loans
-- against the current official curve, so they never go stale.

create table if not exists public.existing_mortgages (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  schema_version  integer not null default 1,
  loans           jsonb not null,
  as_of_date      date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint existing_mortgages_schema_version_positive
    check (schema_version >= 1),
  constraint existing_mortgages_loans_is_array
    check (jsonb_typeof(loans) = 'array'),
  constraint existing_mortgages_loans_size
    check (octet_length(loans::text) <= 200000)
);

comment on table public.existing_mortgages is
  'Each user''s current mortgage as confirmed from early-repayment balance reports. loans is the source of truth; forecasts are recomputed, never stored.';

-- public.set_updated_at() is defined in the mortgage_scenarios migration.
drop trigger if exists existing_mortgages_set_updated_at on public.existing_mortgages;
create trigger existing_mortgages_set_updated_at
  before update on public.existing_mortgages
  for each row execute function public.set_updated_at();

alter table public.existing_mortgages enable row level security;

drop policy if exists "select own existing mortgage" on public.existing_mortgages;
create policy "select own existing mortgage"
  on public.existing_mortgages
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "insert own existing mortgage" on public.existing_mortgages;
create policy "insert own existing mortgage"
  on public.existing_mortgages
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "update own existing mortgage" on public.existing_mortgages;
create policy "update own existing mortgage"
  on public.existing_mortgages
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "delete own existing mortgage" on public.existing_mortgages;
create policy "delete own existing mortgage"
  on public.existing_mortgages
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
