-- Daily limits on reading payoff reports with the AI model, which is paid
-- per call. Each read records only who and when: never the file, its
-- contents or its name.
--
-- Reads are claimed through claim_payoff_report_read() before every model
-- call. It checks a site-wide cap and the caller's own cap over the last
-- 24 hours and records the read in one transaction, serialized by an
-- advisory lock so parallel uploads cannot overshoot either cap.

create table if not exists public.payoff_report_reads (
  id       bigint generated always as identity primary key,
  user_id  uuid not null references auth.users(id) on delete cascade,
  read_at  timestamptz not null default now()
);

comment on table public.payoff_report_reads is
  'One row per payoff-report reading attempt (who and when only), for daily usage limits.';

create index if not exists payoff_report_reads_user_read_at_idx
  on public.payoff_report_reads (user_id, read_at desc);
create index if not exists payoff_report_reads_read_at_idx
  on public.payoff_report_reads (read_at);

alter table public.payoff_report_reads enable row level security;

-- Users may see their own reads. There are deliberately no insert, update
-- or delete policies: rows are written only by the function below.
drop policy if exists "select own report reads" on public.payoff_report_reads;
create policy "select own report reads"
  on public.payoff_report_reads
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.claim_payoff_report_read(user_limit integer, site_limit integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  -- Callers pass the limits, but can never raise them past these ceilings.
  user_cap integer := least(greatest(coalesce(user_limit, 0), 0), 50);
  site_cap integer := least(greatest(coalesce(site_limit, 0), 0), 1000);
begin
  if caller is null then
    return 'unauthenticated';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.claim_payoff_report_read'));

  if (select count(*) from public.payoff_report_reads
      where read_at > now() - interval '24 hours') >= site_cap then
    return 'site-limit';
  end if;

  if (select count(*) from public.payoff_report_reads
      where user_id = caller and read_at > now() - interval '24 hours') >= user_cap then
    return 'user-limit';
  end if;

  insert into public.payoff_report_reads (user_id) values (caller);
  return 'ok';
end;
$$;

revoke all on function public.claim_payoff_report_read(integer, integer) from public;
grant execute on function public.claim_payoff_report_read(integer, integer) to authenticated;
