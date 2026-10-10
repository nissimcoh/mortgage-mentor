-- Admin access for a single fixed, hardcoded set of site-owner emails.
--
-- No service-role/secret key is introduced anywhere by this migration or
-- by the app. Every admin capability below is a SECURITY DEFINER SQL
-- function, callable only by the `authenticated` role via the ordinary
-- anon-key-based Supabase client, and each one re-checks
-- is_current_user_admin() INTERNALLY before doing anything — so calling
-- these RPCs directly (bypassing the app's own UI) can never grant more
-- than an admin already has, and a non-admin gets a clean "not
-- authorized" exception, never a service-role bypass.
--
-- To change who is an admin, add a new migration that replaces this
-- function body — the allowed-email list is intentionally version-
-- controlled here, not a runtime environment variable, so every change
-- to who holds admin access is itself reviewable history.

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'email', '') = any (array[
    'nissssssim@gmail.com'
  ]);
$$;

revoke all on function public.is_current_user_admin() from public;
grant execute on function public.is_current_user_admin() to authenticated;

-- Extends (never replaces) the existing "select own scenarios" policy —
-- Postgres ORs multiple permissive policies for the same command
-- together, so an admin gets the union: their own rows (already true)
-- plus every row (new). Ordinary users are completely unaffected.
drop policy if exists "admins can select all scenarios" on public.mortgage_scenarios;
create policy "admins can select all scenarios"
  on public.mortgage_scenarios
  for select
  to authenticated
  using (public.is_current_user_admin());

-- Read-only, admin-only view of who has signed up. Returns only the
-- columns the admin dashboard actually shows — never encrypted_password,
-- raw tokens, or any other auth.users column.
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'not authorized';
  end if;

  return query
    select u.id, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at
    from auth.users u
    order by u.created_at desc;
end;
$$;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;

-- Every scenario across every user, with the owner's email attached, for
-- the admin dashboard's scenario table.
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
  if not public.is_current_user_admin() then
    raise exception 'not authorized';
  end if;

  return query
    select s.id, s.user_id, u.email, s.name, s.updated_at, s.created_at
    from public.mortgage_scenarios s
    join auth.users u on u.id = s.user_id
    order by s.updated_at desc;
end;
$$;

revoke all on function public.admin_list_scenarios() from public;
grant execute on function public.admin_list_scenarios() to authenticated;

-- Deletes any single scenario by id, regardless of owner. Distinct from
-- the ordinary deleteScenario server action (lib/scenarios/actions.ts),
-- which stays RLS-scoped to the caller's own rows and is unaffected by
-- this migration.
create or replace function public.admin_delete_scenario(target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'not authorized';
  end if;

  delete from public.mortgage_scenarios where id = target_id;
end;
$$;

revoke all on function public.admin_delete_scenario(uuid) from public;
grant execute on function public.admin_delete_scenario(uuid) to authenticated;

-- Deletes a user account outright (their scenarios cascade-delete via the
-- existing mortgage_scenarios.user_id foreign key). This removes the row
-- from auth.users directly at the SQL level rather than through
-- Supabase's Admin API (which would require a service-role key) — that
-- API's own deleteUser ultimately does the same underlying deletion, but
-- going through SQL here means no service-role key ever needs to exist
-- in this app. An admin can never delete their own account through this
-- function, to avoid ever accidentally locking out the only admin.
create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'not authorized';
  end if;

  if target_user_id = (select auth.uid()) then
    raise exception 'cannot delete your own account from the admin panel';
  end if;

  delete from auth.users where id = target_user_id;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;
