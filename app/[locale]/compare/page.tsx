import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
import { getMarketSnapshot } from "@/lib/market-data/get-market-snapshot";
import { getMortgageForecastData } from "@/lib/market-data/sources/boi-mortgage-forecast";
import { getMakamAnchorData } from "@/lib/market-data/sources/boi-makam";
import { buildCalculatorMarketData } from "@/lib/market-data/build-calculator-market-data";
import ScenarioCompare from "@/components/ScenarioCompare";
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
    title: `${dict.nav.compare} | MortgageMentor`,
    description: dict.comparePage.intro,
  };
}

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getDictionary(locale);

  // Curve/Makam IDs pinned by EITHER scenario (aTrackNForecastCurveId /
  // bTrackNForecastCurveId, ...MakamSnapshotId) — resolved server-side
  // against the FULL workbook/anchor history in one shared fetch, exactly
  // like the calculator does for its own single scenario.
  const query = await searchParams;
  const requestedCurveIds = Object.entries(query)
    .filter(([key]) => /^[ab]Track\d+ForecastCurveId$/.test(key))
    .flatMap(([, value]) =>
      typeof value === "string" ? [value] : (value ?? []),
    );
  const requestedMakamIds = Object.entries(query)
    .filter(([key]) => /^[ab]Track\d+MakamSnapshotId$/.test(key))
    .flatMap(([, value]) =>
      typeof value === "string" ? [value] : (value ?? []),
    );

  const [marketSnapshot, forecastData, makamData] = await Promise.all([
    getMarketSnapshot(),
    getMortgageForecastData(requestedCurveIds),
    getMakamAnchorData(requestedMakamIds),
  ]);
  const marketData = buildCalculatorMarketData(
    marketSnapshot,
    forecastData,
    makamData,
  );

  return (
    <main className="bg-slate-50 text-slate-900">
      <section className="mx-auto max-w-6xl px-6 pt-10 pb-14 sm:pt-12">
        <Link
          href={`/${locale}`}
          className="text-sm text-slate-500 transition hover:text-slate-800"
        >
          {dict.calculator.backToHome}
        </Link>

        <h1 className="mt-3 mb-2 text-3xl font-bold tracking-tight sm:text-4xl">
          {dict.nav.compare}
        </h1>
        <p className="mb-6 text-lg leading-8 text-slate-600">
          {dict.comparePage.intro}
        </p>

        <Suspense fallback={null}>
          <ScenarioCompare
            locale={locale}
            labels={dict.comparePage}
            marketData={marketData}
            calculatorHref={`/${locale}/calculator`}
          />
        </Suspense>
      </section>
    </main>
  );
}
