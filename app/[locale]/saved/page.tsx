import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
import { isValidResultSnapshot } from "@/lib/scenarios/payload";
import { createClient } from "@/lib/supabase/server";
import ScenarioCard from "@/components/ScenarioCard";
import { getDictionary } from "../dictionaries";

/** Cards per page; a multiple of the two-column grid. */
const PAGE_SIZE = 24;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getDictionary(locale);
  return {
    title: `${dict.nav.saved} | MortgageMentor`,
    description: dict.savedPage.intro,
  };
}

export default async function SavedPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();
  const { page: rawPage } = await searchParams;
  const requestedPage = typeof rawPage === "string" && /^[1-9]\d{0,5}$/.test(rawPage) ? Number(rawPage) : 1;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/signin?next=${encodeURIComponent(`/${locale}/saved`)}`);
  }

  const dict = await getDictionary(locale);

  // RLS's "select own scenarios" policy is the real ownership boundary;
  // this .eq("user_id", ...) is the normal, expected app-level filter on
  // top of it, using the signed-in user's own session as usual.
  // One page of rows plus the exact total, in a single request.
  const from = (requestedPage - 1) * PAGE_SIZE;
  const { data: rows, error, count } = await supabase
    .from("mortgage_scenarios")
    .select("id, name, result_snapshot, updated_at", { count: "exact" })
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  const total = count ?? rows?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Past the end (e.g. after deleting the last cards of the last page).
  if (!error && requestedPage > pageCount) redirect(pageHref(locale, pageCount));

  if (error) {
    // Safe fields only (never the caller's session/tokens) — the user
    // only ever sees the generic, translated loadErrorMessage below, not
    // this raw Postgres error.
    console.error("[saved] failed to load scenarios:", {
      code: error.code,
      message: error.message,
      hint: error.hint,
    });
  }

  return (
    <main className="bg-transparent text-slate-900">
      <section className="mx-auto max-w-3xl px-6 pt-10 pb-16 sm:pt-12">
        <Link
          href={`/${locale}`}
          className="text-sm text-slate-500 transition hover:text-slate-800"
        >
          {dict.calculator.backToHome}
        </Link>

        <h1 className="mt-3 mb-2 text-3xl font-bold tracking-tight">
          {dict.nav.saved}
        </h1>
        <p className="mb-6 text-base leading-7 text-slate-600">
          {dict.savedPage.intro}
        </p>

        {/* Comparing needs at least two saved mixes. */}
        {!error && total >= 2 && (
          <Link href={`/${locale}/compare`} className="mb-6 inline-flex min-h-11 items-center rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white">
            {dict.savedComparison.open}
          </Link>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {dict.savedPage.loadErrorMessage}
          </p>
        )}

        {!error && total === 0 && (
          <div className="glass-panel rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
            <p className="text-base font-medium text-slate-700">
              {dict.savedPage.emptyTitle}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {dict.savedPage.emptyBody}
            </p>
            <Link
              href={`/${locale}/calculator`}
              className="mt-4 inline-block rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              {dict.savedPage.emptyCta}
            </Link>
          </div>
        )}

        {!error && rows && rows.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((row) => {
              const resultSnapshot = isValidResultSnapshot(row.result_snapshot)
                ? row.result_snapshot
                : null;

              return (
                <ScenarioCard
                  key={row.id}
                  id={row.id}
                  name={row.name}
                  updatedAt={row.updated_at}
                  locale={locale}
                  resultSnapshot={resultSnapshot}
                  labels={dict.savedPage}
                />
              );
            })}
          </div>
        )}

        {!error && pageCount > 1 && (
          <nav aria-label={dict.savedPage.paginationLabel} className="mt-6 flex items-center justify-between gap-3 text-sm">
            {requestedPage > 1 ? (
              <Link href={pageHref(locale, requestedPage - 1)} className="glass-secondary inline-flex min-h-11 items-center rounded-xl px-4 font-medium">
                {dict.savedPage.newerPage}
              </Link>
            ) : <span />}
            <span className="text-slate-500">
              {dict.savedPage.pageStatus.replace("{page}", String(requestedPage)).replace("{pages}", String(pageCount))}
            </span>
            {requestedPage < pageCount ? (
              <Link href={pageHref(locale, requestedPage + 1)} className="glass-secondary inline-flex min-h-11 items-center rounded-xl px-4 font-medium">
                {dict.savedPage.olderPage}
              </Link>
            ) : <span />}
          </nav>
        )}
      </section>
    </main>
  );
}

function pageHref(locale: string, page: number) {
  return page > 1 ? `/${locale}/saved?page=${page}` : `/${locale}/saved`;
}
