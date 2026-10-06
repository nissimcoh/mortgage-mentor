import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/server";
import { toComparisonScenario } from "@/lib/scenarios/comparison";
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
  // and no market refetch/recalculation: compare historical saved snapshots.
  const { data: rows, error } = await supabase.from("mortgage_scenarios")
    .select("id, name, input_payload, result_snapshot, market_references, calculated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  const scenarios = error ? [] : (rows ?? []).flatMap(row => {
    const scenario = toComparisonScenario(row);
    return scenario ? [scenario] : [];
  });
  const hasInvalid = !error && scenarios.length < (rows?.length ?? 0);

  return (
    <main className="bg-transparent text-slate-900">
      <section className="mx-auto max-w-6xl px-6 pt-10 pb-16 sm:pt-12">
        <Link href={`/${locale}/saved`} className="text-sm text-slate-500 hover:text-slate-800">{labels.back}</Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">{labels.title}</h1>
        <p className="mt-3 text-base leading-7 text-slate-600">{labels.intro}</p>
        {error ? <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{labels.loadError}</p> : (
          <>
            {hasInvalid && <p role="status" className="mt-4 text-sm text-amber-800">{labels.invalid}</p>}
            {scenarios.length < 2 ? (
              <div className="glass-panel mt-6 p-6 text-center">
                <h2 className="text-xl font-semibold">{labels.emptyTitle}</h2>
                <p className="mt-2 text-sm text-slate-600">{labels.emptyBody}</p>
                <Link href={`/${locale}/calculator`} className="mt-5 inline-block rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white">{labels.calculator}</Link>
              </div>
            ) : <SavedScenarioComparison scenarios={scenarios} locale={locale} labels={labels} />}
          </>
        )}
      </section>
    </main>
  );
}
