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
           coalesce(s.saved_count, 0) as saved_count, s.last_save_at
    from auth.users u
    left join saved s on s.user_id = u.id
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
