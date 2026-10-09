-- Existing admin RPCs declare text, while auth.users.email is varchar(255).
-- PL/pgSQL RETURN QUERY requires an exact type match (otherwise SQLSTATE 42804).
-- Preserve the existing signatures, authorization checks and execute grants.
-- No user data, admin membership, RLS policies or deletion behavior is changed.
do $$
begin
  if to_regprocedure('public.admin_list_users()') is null
     or to_regprocedure('public.admin_list_scenarios()') is null then
    raise exception 'Existing admin RPCs must be installed before this repair';
  end if;
end;
$$;

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
    select u.id, u.email::text, u.created_at, u.last_sign_in_at, u.email_confirmed_at
    from auth.users u
    order by u.created_at desc;
end;
$$;

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
    select s.id, s.user_id, u.email::text, s.name, s.updated_at, s.created_at
    from public.mortgage_scenarios s
    join auth.users u on u.id = s.user_id
    order by s.updated_at desc;
end;
$$;
