# Account roles and in-app administration

The account-menu Administration link opens /he/admin or /en/admin. The
owner can find an existing registered account, select Administrator or User
in its Role column, choose Save role and confirm. A person must register
before appearing in this directory. Removing administrator access preserves
the account and its own saved scenarios. The owner row cannot be edited.

| Role | Access |
| --- | --- |
| User | Existing calculator and own saved scenarios |
| Administrator | User directory and aggregate usage metadata |
| Owner | Administrator access plus appointing/removing administrators |

Role assignments live in the protected public.user_roles table keyed by
immutable auth.users.id. An absent assignment means User, including new
registrations. Runtime checks read the current assignment; there is no
email allowlist, editable user-metadata role, environment variable or cached
JWT role. An email change preserves the role, and revocation takes effect
on the next protected database request. The account menu refreshes its
presentation-only permission result when opened, preserving the existing
prefetch result while checking.

Migration 20261010130000 reuses the previous admin check once to preserve
exactly one confirmed existing owner. It then replaces that check with
account-role lookup. It aborts if that existing owner cannot be identified;
this handover migration requires an existing owner account. It does not
publish the account ID or hardcode an email. Future role changes happen in
the application. Owner transfer is deliberately not exposed by this UI.

Role and audit tables have RLS enabled and no direct authenticated/anonymous
access. Owner-only admin_set_user_role validates the target, limits assignment
to User/Administrator, protects Owner, checks the expected previous role,
serializes concurrent changes and records successful changes in
user_role_events. The server action independently verifies ownership and
returns bounded UI errors. Successful changes refresh the administration
page. A network failure or stale role leaves a retry/refresh message rather
than claiming success.

Delegated administrators cannot change roles, call legacy deletion/scenario
listing RPCs, or read other users' complete financial rows through the old
administrator RLS policy. Those legacy powers remain owner-only; no deletion
control is mounted by the administration page. Ordinary per-user scenario
policies remain unchanged.

Validation: npm test, npm run lint, npm run build, npm run smoke.
The executable database suite is supabase/tests/dynamic_user_roles.sql:
run with Supabase db query --linked --file followed by that path. It inserts
only disposable users/scenarios, tests assignment, removal, protected owner,
invalid/stale targets, metadata/email spoofing, email changes, direct-table
restrictions, administrator privacy and audit recording, then rolls back
every test change. No real user is promoted, demoted or deleted by this suite.

Security design references:
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [PostgreSQL SECURITY DEFINER precautions](https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY)
