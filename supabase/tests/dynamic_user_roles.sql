-- Run against a migrated database with Supabase db query --file.
-- All disposable users, assignments and scenarios are rolled back.
begin;

create function pg_temp.role_test_claims(account_id uuid, spoof_owner boolean default false)
returns void language plpgsql as $$
declare email_claim text;
begin
  select u.email into email_claim from auth.users u where u.id = account_id;
  if spoof_owner then
    select u.email into email_claim from auth.users u
      join public.user_roles r on r.user_id = u.id where r.role = 'owner';
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', account_id, 'email', email_claim, 'role', 'authenticated',
    'user_metadata', jsonb_build_object('role', 'owner')
  )::text, true);
end;
$$;

do $setup$
declare admin_id uuid := gen_random_uuid(); ordinary_id uuid := gen_random_uuid();
begin
  perform set_config('app.role_test_admin', admin_id::text, true);
  perform set_config('app.role_test_user', ordinary_id::text, true);
  if (select count(*) from public.user_roles where role = 'owner') <> 1 then
    raise exception 'owner handover failed';
  end if;
  insert into auth.users (id, email, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
  values (admin_id, admin_id::text || '@role-test.invalid', now(), now(), now(), '{"role":"owner"}'),
         (ordinary_id, ordinary_id::text || '@role-test.invalid', now(), now(), now(), '{"role":"admin"}');
  insert into public.mortgage_scenarios (user_id, name, schema_version, calculator_version, locale, input_payload, result_snapshot, market_references, calculated_at)
  values (admin_id, 'synthetic role test', 1, 'role-test', 'en', '{}', '{}', '{}', now()),
         (ordinary_id, 'synthetic role test', 1, 'role-test', 'en', '{}', '{}', '{}', now());
  perform pg_temp.role_test_claims((select r.user_id from public.user_roles r where r.role = 'owner'));
end;
$setup$;
set local role authenticated;

do $owner$
declare protected boolean := false;
begin
  if public.current_user_app_role() <> 'owner' or not public.is_current_user_admin() or not public.is_current_user_owner() then
    raise exception 'owner access missing';
  end if;
  perform public.admin_set_user_role(current_setting('app.role_test_admin')::uuid, 'admin', 'user');
  perform public.admin_set_user_role(current_setting('app.role_test_admin')::uuid, 'admin', 'admin'); -- no-op
  begin
    perform public.admin_set_user_role(auth.uid(), 'user', 'user');
  exception when raise_exception then
    if sqlerrm <> 'OWNER_PROTECTED' then raise; end if;
    protected := true;
  end;
  if not protected then raise exception 'owner can be demoted'; end if;
  begin
    perform public.admin_set_user_role(current_setting('app.role_test_admin')::uuid, 'user', 'user');
    raise exception 'stale assignment was allowed';
  exception when serialization_failure then null;
  end;
  begin
    perform public.admin_set_user_role(current_setting('app.role_test_user')::uuid, 'owner', 'user');
    raise exception 'owner escalation was allowed';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.admin_set_user_role(gen_random_uuid(), 'admin', 'user');
    raise exception 'missing account was allowed';
  exception when no_data_found then null;
  end;
end;
$owner$;
reset role;

-- Changing a disposable administrator's email must preserve their assigned role.
update auth.users set email = id::text || '@changed-role-test.invalid'
  where id = current_setting('app.role_test_admin')::uuid;
do $$ begin perform pg_temp.role_test_claims(current_setting('app.role_test_admin')::uuid); end; $$;
set local role authenticated;

do $admin$
declare snapshot jsonb;
begin
  if public.current_user_app_role() <> 'admin' or not public.is_current_user_admin() or public.is_current_user_owner() then
    raise exception 'assigned administrator role missing';
  end if;
  snapshot := public.admin_usage_snapshot();
  if not exists (select 1 from jsonb_array_elements(snapshot->'users') u where u->>'id' = auth.uid()::text and u->>'role' = 'admin')
     or exists (select 1 from jsonb_array_elements(snapshot->'users') u, jsonb_object_keys(u) k
       where k not in ('id','email','created_at','last_sign_in_at','saved_count','last_save_at','role')) then
    raise exception 'invalid role-aware usage metadata';
  end if;
  if (select count(*) from public.mortgage_scenarios) <> 1
     or exists (select 1 from public.mortgage_scenarios where user_id <> auth.uid()) then
    raise exception 'delegated administrator can read other scenarios';
  end if;
  begin
    perform public.admin_set_user_role(current_setting('app.role_test_user')::uuid, 'admin', 'user');
    raise exception 'administrator can delegate';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_list_scenarios();
    raise exception 'administrator can use legacy scenario list';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_delete_scenario(null);
    raise exception 'administrator can use legacy scenario delete';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_delete_user(null);
    raise exception 'administrator can use legacy account delete';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.user_roles set role = 'owner' where user_id = auth.uid();
    raise exception 'direct role write allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.user_role_events;
    raise exception 'direct audit read allowed';
  exception when insufficient_privilege then null;
  end;
end;
$admin$;
reset role;

-- Matching the old owner email and spoofing metadata cannot grant authority.
do $$ begin perform pg_temp.role_test_claims(current_setting('app.role_test_user')::uuid, true); end; $$;
set local role authenticated;
do $ordinary$
begin
  if public.current_user_app_role() <> 'user' or public.is_current_user_admin() or public.is_current_user_owner() then
    raise exception 'ordinary account escalated through claims or metadata';
  end if;
  begin
    perform public.admin_usage_snapshot();
    raise exception 'ordinary account can load usage';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_set_user_role(auth.uid(), 'admin', 'user');
    raise exception 'self-promotion allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.user_roles (user_id, role) values (auth.uid(), 'admin');
    raise exception 'ordinary account can insert roles';
  exception when insufficient_privilege then null;
  end;
end;
$ordinary$;
reset role;

set local role anon;
do $anonymous$
begin
  begin
    perform public.admin_usage_snapshot();
    raise exception 'anonymous usage allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_set_user_role(null, 'admin', 'user');
    raise exception 'anonymous role change allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.is_current_user_admin();
    raise exception 'anonymous helper execution allowed';
  exception when insufficient_privilege then null;
  end;
end;
$anonymous$;
reset role;

do $$ begin perform pg_temp.role_test_claims((select r.user_id from public.user_roles r where r.role = 'owner')); end; $$;
set local role authenticated;
do $$ begin perform public.admin_set_user_role(current_setting('app.role_test_admin')::uuid, 'user', 'admin'); end; $$;
reset role;
do $$ begin perform pg_temp.role_test_claims(current_setting('app.role_test_admin')::uuid); end; $$;
set local role authenticated;
do $revoked$
begin
  if public.current_user_app_role() <> 'user' or public.is_current_user_admin() then
    raise exception 'revoked assignment remains active';
  end if;
  begin
    perform public.admin_usage_snapshot();
    raise exception 'revoked administrator can load usage';
  exception when insufficient_privilege then null;
  end;
end;
$revoked$;
reset role;

do $audit$
begin
  if (select count(*) from public.user_role_events where target_user_id = current_setting('app.role_test_admin')::uuid) <> 2
     or exists (select 1 from public.user_role_events where target_user_id = current_setting('app.role_test_admin')::uuid
       and actor_id <> (select r.user_id from public.user_roles r where r.role = 'owner'))
     or (select count(*) from public.user_roles where role = 'owner') <> 1 then
    raise exception 'audit or owner protection failed';
  end if;
end;
$audit$;

select true as owner_preserved, true as grant_and_revoke_work, true as default_user_secure,
       true as owner_cannot_be_demoted, true as direct_write_denied,
       true as administrator_cannot_delegate_or_delete, true as financial_rows_stay_private,
       true as stale_assignment_rejected, true as email_changes_preserve_role,
       true as spoofed_metadata_ignored, true as anonymous_denied, true as audit_recorded;
rollback;
