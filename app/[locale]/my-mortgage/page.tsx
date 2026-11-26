import { BRAND_NAME } from "@/lib/brand";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import MyMortgage from "@/components/MyMortgage";
import { isValidLocale } from "@/lib/i18n/config";
import { getCalculatorRateSnapshot } from "@/lib/market-data/get-market-snapshot";
import { getMortgageForecastData } from "@/lib/market-data/sources/boi-mortgage-forecast";
import type { ExistingMortgageMarket } from "@/lib/payoff-report";
import { loadMyMortgage } from "@/lib/payoff-report/load-saved";
import { COMPARISON_COLUMNS, loadComparisonScenarios } from "@/lib/scenarios/load-comparison";
import { createClient } from "@/lib/supabase/server";
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
    title: `${dict.payoffPage.title} | ${BRAND_NAME}`,
    description: dict.payoffPage.intro,
    // Not linked from the site yet; keep it out of search results until it is.
    robots: { index: false, follow: false },
  };
}

export default async function MyMortgagePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  // Reading a report calls a paid API; the endpoint is signed-in only too.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/signin?next=${encodeURIComponent(`/${locale}/my-mortgage`)}`);
  }

  // The same official sources as the calculator; both degrade to dated
  // fallbacks and never throw. Only the latest curve reaches the client.
  // Saved mixes for the refinance comparison: same session and RLS boundary
  // as /compare, without payment series (fetched when a mix is selected).
  const mixesQuery = supabase
    .from("mortgage_scenarios")
    .select(COMPARISON_COLUMNS)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  const [dict, rateSnapshot, forecastData, saved, mixRows] = await Promise.all([
    getDictionary(locale),
    getCalculatorRateSnapshot(),
    getMortgageForecastData(),
    loadMyMortgage(user.id),
    mixesQuery,
  ]);
  const mixes = mixRows.error ? [] : await loadComparisonScenarios(mixRows.data ?? [], []);
  const curve = forecastData.curves[0];
  const market: ExistingMortgageMarket = {
    boiRatePercent: rateSnapshot.boiRate.ratePercent,
    nominalZeroYieldsPercent: curve.nominalZeroYieldsPercent,
    realZeroYieldsPercent: curve.realZeroYieldsPercent,
    expectedCpiIndex: curve.expectedCpiIndex,
    curveId: curve.id,
  };

  return (
    <main className="bg-transparent text-slate-900">
      <section className="mx-auto max-w-4xl px-4 pt-8 pb-16 sm:px-6 sm:pt-14">
        <Link
          href={`/${locale}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-900"
        >
          {dict.calculator.backToHome}
        </Link>
        <h1 className="mt-4 mb-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          {dict.payoffPage.title}
        </h1>
        <p className="mb-8 text-lg leading-8 text-slate-500">{dict.payoffPage.intro}</p>
        <MyMortgage
          locale={locale}
          labels={dict.payoffPage}
          calculatorLabels={dict.calculator}
          market={market}
          initialSaved={saved}
          readingAvailable={Boolean(process.env.ANTHROPIC_API_KEY)}
          mixes={mixes}
          comparisonLabels={dict.savedComparison}
          share={{ labels: dict.shareImage, siteName: dict.nav.appName }}
        />
      </section>
    </main>
  );
}
