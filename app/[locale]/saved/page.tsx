import { BRAND_NAME } from "@/lib/brand";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
import { isValidResultSnapshot } from "@/lib/scenarios/payload";
import { createClient } from "@/lib/supabase/server";
import { combinePayoffFiles, formatMoney } from "@/lib/payoff-report";
import { loadMyMortgage } from "@/lib/payoff-report/load-saved";
import Icon from "@/components/Icon";
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
    title: `${dict.nav.saved} | ${BRAND_NAME}`,
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

  // RLS's "select own scenarios" policy is the real ownership boundary;
  // this .eq("user_id", ...) is the normal, expected app-level filter on
  // top of it, using the signed-in user's own session as usual.
  // One page of rows plus the exact total, in a single request.
  const from = (requestedPage - 1) * PAGE_SIZE;
  const scenariosQuery = supabase
    .from("mortgage_scenarios")
    .select("id, name, result_snapshot, updated_at", { count: "exact" })
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  const [dict, myMortgage, { data: rows, error, count }] = await Promise.all([
    getDictionary(locale),
    loadMyMortgage(user.id),
    scenariosQuery,
  ]);
  const myTotals = myMortgage ? combinePayoffFiles([{ fileName: "", loans: myMortgage.loans }]).totals : null;
  const showMyMortgage = myTotals !== null || Boolean(process.env.ANTHROPIC_API_KEY);
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
      <section className="mx-auto max-w-3xl px-4 pt-8 pb-16 sm:px-6 sm:pt-14">
        <Link
          href={`/${locale}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-900"
        >
          {dict.calculator.backToHome}
        </Link>

        <h1 className="mt-4 mb-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          {dict.nav.saved}
        </h1>
        <p className="mb-8 text-lg leading-8 text-slate-500">
          {dict.savedPage.intro}
        </p>

        {/* The user's current mortgage, the baseline every saved mix is weighed against. */}
        {showMyMortgage && <Link
          href={`/${locale}/my-mortgage`}
          className="glass-hero lift mb-8 flex flex-wrap items-center gap-x-6 gap-y-3 px-6 py-5"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-semibold tracking-tight">{dict.savedPage.myMortgageTitle}</span>
            <span className="mt-1 block text-sm text-slate-500">
              {myTotals ? dict.savedPage.myMortgageOpen : dict.savedPage.myMortgageAddBody}
            </span>
          </span>
          {myTotals ? (
            <dl className="flex gap-6">
              <div>
                <dt className="text-xs text-slate-500">{dict.savedPage.myMortgageBalance}</dt>
                <dd className="mt-0.5 text-xl font-semibold tabular-nums"><bdi>{myTotals.totalToSettle === null ? dict.payoffPage.incompleteReportAmount : formatMoney(myTotals.totalToSettle, locale)}</bdi></dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">{dict.savedPage.myMortgagePayment}</dt>
                <dd className="mt-0.5 text-xl font-semibold tabular-nums"><bdi>{myTotals.monthlyPayment === null ? dict.payoffPage.incompleteReportAmount : formatMoney(myTotals.monthlyPayment, locale)}</bdi></dd>
              </div>
            </dl>
          ) : (
            <span className="glass-button inline-flex min-h-11 items-center px-5 text-sm font-medium">{dict.savedPage.myMortgageAdd}</span>
          )}
        </Link>}

        {!error && total > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {/* Comparing needs at least two saved mixes. */}
            {total >= 2 && (
              <Link href={`/${locale}/compare`} className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong">
                {dict.savedComparison.open}
              </Link>
            )}
            <Link href={`/${locale}/calculator`} className="glass-secondary inline-flex min-h-11 items-center px-5 py-2.5 text-sm font-medium">
              {dict.savedPage.emptyCta}
            </Link>
          </div>
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
          <div className="glass-panel px-6 py-14 text-center">
            <span aria-hidden="true" className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent"><Icon name="bookmark" size={26} /></span>
            <p className="text-xl font-semibold tracking-tight text-slate-900">
              {dict.savedPage.emptyTitle}
            </p>
            <p className="mt-2 text-base text-slate-500">
              {dict.savedPage.emptyBody}
            </p>
            <Link
              href={`/${locale}/calculator`}
              className="glass-button mt-6 inline-flex min-h-11 items-center px-6 text-[15px] font-medium text-white"
            >
              {dict.savedPage.emptyCta}
            </Link>
          </div>
        )}

        {!error && rows && rows.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
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
