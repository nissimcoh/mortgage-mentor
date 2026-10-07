import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
import { formatDateOnly, formatDateTimeIsrael } from "@/lib/forms/dates";
import { requireAdmin } from "@/lib/admin/guard";
import { getDictionary } from "../dictionaries";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getDictionary(locale);
  return {
    // Deliberately generic and marked for exclusion from indexing — this
    // is an internal, auth-gated tool, never meant to be discoverable.
    title: `${dict.adminPage.title} | MortgageMentor`,
    robots: { index: false, follow: false },
  };
}

interface AdminUserRow {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
}

interface AdminScenarioRow {
  id: string;
  user_id: string;
  owner_email: string | null;
  name: string;
  updated_at: string;
  created_at: string;
}

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getDictionary(locale);
  const guard = await requireAdmin();

  if (!guard.ok && guard.error === "unauthenticated") {
    redirect(`/${locale}/signin?next=${encodeURIComponent(`/${locale}/admin`)}`);
  }

  if (!guard.ok) {
    return (
      <main className="bg-transparent text-slate-900">
        <section className="mx-auto max-w-2xl px-6 pt-10 pb-16 sm:pt-12">
          <Link
            href={`/${locale}`}
            className="text-sm text-slate-500 transition hover:text-slate-800"
          >
            {dict.calculator.backToHome}
          </Link>
          <h1 className="mt-3 mb-2 text-2xl font-bold tracking-tight">
            {dict.adminPage.notAuthorizedTitle}
          </h1>
          <p className="mt-1 text-base leading-7 text-slate-600">
            {dict.adminPage.notAuthorizedBody}
          </p>
        </section>
      </main>
    );
  }

  const [usersResult, scenariosResult] = await Promise.all([
    guard.supabase.rpc("admin_list_users"),
    guard.supabase.rpc("admin_list_scenarios"),
  ]);

  if (usersResult.error) {
    console.error("[admin] admin_list_users failed:", {
      code: usersResult.error.code,
      message: usersResult.error.message,
      hint: usersResult.error.hint,
    });
  }
  if (scenariosResult.error) {
    console.error("[admin] admin_list_scenarios failed:", {
      code: scenariosResult.error.code,
      message: scenariosResult.error.message,
      hint: scenariosResult.error.hint,
    });
  }

  const loadError = Boolean(usersResult.error || scenariosResult.error);
  const users = (usersResult.data ?? []) as AdminUserRow[];
  const scenarios = (scenariosResult.data ?? []) as AdminScenarioRow[];



  return (
    <main className="bg-transparent text-slate-900">
      <section className="mx-auto max-w-5xl px-6 pt-10 pb-16 sm:pt-12">
        <Link
          href={`/${locale}`}
          className="text-sm text-slate-500 transition hover:text-slate-800"
        >
          {dict.calculator.backToHome}
        </Link>

        <h1 className="mt-3 mb-2 text-3xl font-bold tracking-tight">
          {dict.adminPage.title}
        </h1>
        <p className="mb-6 text-sm leading-6 text-slate-500">
          {dict.adminPage.intro}
        </p>

        {loadError && (
          <p
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {dict.adminPage.loadErrorMessage}
          </p>
        )}

        {!loadError && <>
        <section className="glass-panel mb-8 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold tracking-tight">
              {dict.adminPage.usersSectionTitle}
            </h2>
            <span className="text-sm text-slate-500">
              {dict.adminPage.usersCountLabel}:{" "}
              <strong className="text-slate-900">{users.length}</strong>
            </span>
          </div>

          {users.length === 0 ? (
            <p className="text-sm text-slate-500">
              {dict.adminPage.emptyUsersMessage}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2 pe-3 text-start font-medium">
                      {dict.adminPage.userEmailHeader}
                    </th>
                    <th className="py-2 pe-3 text-start font-medium">
                      {dict.adminPage.userCreatedHeader}
                    </th>
                    <th className="py-2 pe-3 text-start font-medium">
                      {dict.adminPage.userLastSignInHeader}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="py-2 pe-3 font-medium text-slate-900">
                        {row.email ?? "—"}
                        {row.id === guard.user.id && (
                          <span className="ms-1 text-xs font-normal text-slate-400">
                            {dict.adminPage.youLabel}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pe-3 text-slate-600">
                        {formatDateOnly(row.created_at, locale)}
                      </td>
                      <td className="py-2 pe-3 text-slate-600">
                        {row.last_sign_in_at
                          ? formatDateTimeIsrael(row.last_sign_in_at, locale)
                          : dict.adminPage.userNeverSignedIn}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="glass-panel rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold tracking-tight">
              {dict.adminPage.scenariosSectionTitle}
            </h2>
            <span className="text-sm text-slate-500">
              {dict.adminPage.scenariosCountLabel}:{" "}
              <strong className="text-slate-900">{scenarios.length}</strong>
            </span>
          </div>

          {scenarios.length === 0 ? (
            <p className="text-sm text-slate-500">
              {dict.adminPage.emptyScenariosMessage}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2 pe-3 text-start font-medium">
                      {dict.adminPage.scenarioOwnerHeader}
                    </th>
                    <th className="py-2 pe-3 text-start font-medium">
                      {dict.adminPage.scenarioNameHeader}
                    </th>
                    <th className="py-2 pe-3 text-start font-medium">
                      {dict.adminPage.scenarioUpdatedHeader}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="py-2 pe-3 text-slate-600">
                        {row.owner_email ?? "—"}
                      </td>
                      <td className="py-2 pe-3 font-medium text-slate-900">
                        {row.name}
                      </td>
                      <td className="py-2 pe-3 text-slate-600">
                        {formatDateOnly(row.updated_at, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        </>}
      </section>
    </main>
  );
}
