import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/server";
import { COMPARISON_COLUMNS, loadComparisonScenarios } from "@/lib/scenarios/load-comparison";
import SavedScenarioComparison from "@/components/SavedScenarioComparison";
import { getDictionary } from "../dictionaries";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  return { title: `${dict.savedComparison.title} | MortgageMentor`, robots: { index: false, follow: false } };
}

export default async function ComparePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/signin?next=${encodeURIComponent(`/${locale}/compare`)}`);

  const dict = await getDictionary(locale);
  const labels = dict.savedComparison;
  // Session-bound client and RLS remain the ownership boundary. No global cache
  // and no current-market substitution: charts reconstruct the pinned historical
  // context and must match the saved snapshot before displaying any payments.
  const { data: rows, error } = await supabase.from("mortgage_scenarios")
    .select(COMPARISON_COLUMNS)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  const scenarios = error ? [] : await loadComparisonScenarios(rows ?? []);
  const hasInvalid = !error && scenarios.length < (rows?.length ?? 0);

  return (
    <main className="bg-transparent text-slate-900">
      <section className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6 sm:pt-14">
        <Link href={`/${locale}/saved`} className="inline-flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-900">{labels.back}</Link>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{labels.title}</h1>
        <p className="mt-3 max-w-3xl text-lg leading-8 text-slate-500">{labels.intro}</p>
        {error ? <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{labels.loadError}</p> : (
          <>
            {scenarios.length < 2 ? (
              <div className="glass-panel mt-8 px-6 py-14 text-center">
                <h2 className="text-xl font-semibold tracking-tight">{labels.emptyTitle}</h2>
                <p className="mt-2 text-base text-slate-500">{labels.emptyBody}</p>
                <Link href={`/${locale}/calculator`} className="mt-5 inline-block rounded-full bg-accent px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-strong">{labels.calculator}</Link>
              </div>
            ) : <SavedScenarioComparison scenarios={scenarios} locale={locale} labels={labels} />}
            {hasInvalid && <p role="status" className="mt-6 text-sm leading-6 text-slate-500">{labels.invalid}</p>}
          </>
        )}
      </section>
    </main>
  );
}
