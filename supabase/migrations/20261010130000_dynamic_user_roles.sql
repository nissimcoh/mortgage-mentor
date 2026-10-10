-- Roles belong to immutable account IDs. Missing assignments mean "user".
-- Only the owner can change assignments; no role is read from editable metadata.
create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'admin', 'owner')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create unique index user_roles_single_owner on public.user_roles (role) where role = 'owner';
alter table public.user_roles enable row level security;
revoke all on table public.user_roles from public, anon, authenticated;

create table public.user_role_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  previous_role text not null check (previous_role in ('user', 'admin')),
  new_role text not null check (new_role in ('user', 'admin')),
  changed_at timestamptz not null default now()
);
alter table public.user_role_events enable row level security;
revoke all on table public.user_role_events from public, anon, authenticated;
revoke all on sequence public.user_role_events_id_seq from public, anon, authenticated;

-- One-time handover: preserve the currently authorized, confirmed account.
-- Reuse the previous rule before replacing it; no email or UUID is hardcoded.
do $bootstrap$
declare
  account record;
  previous_claims text := current_setting('request.jwt.claims', true);
begin
  for account in select id, email from auth.users where email_confirmed_at is not null loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', account.id, 'email', account.email, 'role', 'authenticated')::text, true);
    if public.is_current_user_admin() is true then
      insert into public.user_roles (user_id, role) values (account.id, 'owner');
    end if;
  end loop;
  perform set_config('request.jwt.claims', coalesce(previous_claims, ''), true);
  if (select count(*) from public.user_roles where role = 'owner') <> 1 then
    raise exception 'exactly one existing owner is required';
  end if;
end;
$bootstrap$;

create function public.current_user_app_role()
returns text language sql stable security definer set search_path = ''
as $$
  select coalesce((select r.role from public.user_roles r where r.user_id = auth.uid()), 'user');
$$;
revoke all on function public.current_user_app_role() from public, anon;
grant execute on function public.current_user_app_role() to authenticated;

create or replace function public.is_current_user_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.current_user_app_role() in ('owner', 'admin'); $$;
revoke all on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to authenticated;

create function public.is_current_user_owner()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.current_user_app_role() = 'owner'; $$;
revoke all on function public.is_current_user_owner() from public, anon;
grant execute on function public.is_current_user_owner() to authenticated;

create function public.admin_set_user_role(target_user_id uuid, new_role text, expected_role text)
returns void language plpgsql security definer set search_path = ''
as $$
declare assigned_role text;
begin
  -- Serialize assignments so concurrent requests cannot overwrite stale roles.
  perform pg_catalog.pg_advisory_xact_lock(7411, 20261010);
  if public.is_current_user_owner() is distinct from true then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if new_role is null or new_role not in ('user', 'admin')
     or expected_role is null or expected_role not in ('user', 'admin') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  perform 1 from auth.users u where u.id = target_user_id for key share;
  if not found then raise exception 'user not found' using errcode = 'P0002'; end if;
  select coalesce((select r.role from public.user_roles r where r.user_id = target_user_id), 'user') into assigned_role;
  if assigned_role = 'owner' then
    raise exception 'OWNER_PROTECTED' using errcode = 'P0001';
  end if;
  if assigned_role <> expected_role then
    raise exception 'ROLE_CHANGED' using errcode = '40001';
  end if;
  if assigned_role = new_role then return; end if;
  insert into public.user_roles (user_id, role, updated_by)
    values (target_user_id, new_role, auth.uid())
    on conflict (user_id) do update
      set role = excluded.role, updated_at = now(), updated_by = excluded.updated_by;
  insert into public.user_role_events (actor_id, target_user_id, previous_role, new_role)
    values (auth.uid(), target_user_id, assigned_role, new_role);
end;
$$;
revoke all on function public.admin_set_user_role(uuid, text, text) from public, anon;
grant execute on function public.admin_set_user_role(uuid, text, text) to authenticated;

-- Delegated administrators get usage metadata, not the owner's legacy powers
-- to inspect complete financial records or delete other people's data.
drop policy if exists "admins can select all scenarios" on public.mortgage_scenarios;
create policy "admins can select all scenarios" on public.mortgage_scenarios
  for select to authenticated using (public.is_current_user_owner());

create or replace function public.admin_list_scenarios()
returns table (
  id uuid,
  user_id uuid,
  owner_email text,
  name text,
  updated_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_current_user_owner() is distinct from true then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
    select s.id, s.user_id, u.email::text, s.name, s.updated_at, s.created_at
    from public.mortgage_scenarios s
    join auth.users u on u.id = s.user_id
    order by s.updated_at desc;
end;
$$;

create or replace function public.admin_delete_scenario(target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_current_user_owner() is distinct from true then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from public.mortgage_scenarios where id = target_id;
end;
$$;

create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_current_user_owner() is distinct from true then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if target_user_id = (select auth.uid()) then
    raise exception 'cannot delete your own account from the admin panel';
  end if;

  delete from auth.users where id = target_user_id;
end;
$$;

revoke all on function public.admin_list_scenarios() from public, anon;
grant execute on function public.admin_list_scenarios() to authenticated;
revoke all on function public.admin_delete_scenario(uuid) from public, anon;
grant execute on function public.admin_delete_scenario(uuid) to authenticated;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- One authorized snapshot replaces paginating every saved scenario and relying
-- on PostgREST Content-Range for correctness. Scalar JSON is not API row-capped.
-- Only account/activity metadata leaves the database; no saved financial data.
create or replace function public.admin_usage_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare snapshot jsonb;
begin
  if public.is_current_user_admin() is distinct from true then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  with saved as (
    select s.user_id, count(*) as saved_count, max(s.updated_at) as last_save_at
    from public.mortgage_scenarios s
    group by s.user_id
  ), accounts as (
    select u.id, u.email::text, u.created_at, u.last_sign_in_at,
           coalesce(s.saved_count, 0) as saved_count, s.last_save_at,
           coalesce(r.role, 'user') as role
    from auth.users u
    left join saved s on s.user_id = u.id
    left join public.user_roles r on r.user_id = u.id
  )
  select jsonb_build_object(
    'users', coalesce(jsonb_agg(to_jsonb(a) order by a.id), '[]'::jsonb),
    'total_users', count(*),
    'total_saved', coalesce(sum(a.saved_count), 0)
  ) into snapshot from accounts a;

  return snapshot;
end;
$$;

revoke all on function public.admin_usage_snapshot() from public, anon;
grant execute on function public.admin_usage_snapshot() to authenticated;
