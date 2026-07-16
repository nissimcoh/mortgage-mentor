import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
import { getMarketSnapshot } from "@/lib/market-data/get-market-snapshot";
import { getMortgageForecastData } from "@/lib/market-data/sources/boi-mortgage-forecast";
import { getMakamAnchorData } from "@/lib/market-data/sources/boi-makam";
import MortgageCalculator from "@/components/MortgageCalculator";
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
    title: `${dict.calculator.title} | MortgageMentor`,
    description: dict.calculator.subtitle,
  };
}

export default async function CalculatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getDictionary(locale);
  const t = dict.calculator;

  // Curve IDs explicitly pinned in the URL (trackNForecastCurveId). They
  // are resolved server-side against the FULL workbook history, so shared
  // links reproduce the exact curve they were calculated with.
  const query = await searchParams;
  const requestedCurveIds = Object.entries(query)
    .filter(([key]) => /^track\d+ForecastCurveId$/.test(key))
    .flatMap(([, value]) =>
      typeof value === "string" ? [value] : (value ?? []),
    );
  const requestedMakamIds = Object.entries(query)
    .filter(([key]) => /^track\d+MakamSnapshotId$/.test(key))
    .flatMap(([, value]) =>
      typeof value === "string" ? [value] : (value ?? []),
    );

  // Server-side only: BOI rate + official Directive-451 forecast curves.
  // Both degrade to dated fallbacks and never throw. Only normalized,
  // serializable data crosses to the client — the latest curve plus any
  // explicitly requested historical curves (the real curve stays server-
  // side until CPI tracks exist).
  const [marketSnapshot, forecastData, makamData] = await Promise.all([
    getMarketSnapshot(),
    getMortgageForecastData(requestedCurveIds),
    getMakamAnchorData(requestedMakamIds),
  ]);
  const marketData = {
    boiRatePercent: marketSnapshot.boiRate.ratePercent,
    boiRateEffectiveDate: marketSnapshot.boiRate.effectiveDate,
    boiRateStatus: (marketSnapshot.boiRate.isLive ? "live" : "fallback") as
      | "live"
      | "fallback",
    marketFetchedAt: marketSnapshot.fetchedAt,
    curves: forecastData.curves.map((curve) => ({
      ...curve,
      realZeroYieldsPercent: [],
    })),
    curveStatus: forecastData.status,
    makamSnapshots: makamData.snapshots,
    makamStatus: makamData.status,
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <section className="mx-auto max-w-6xl px-6 py-14">
        <Link
          href={`/${locale}`}
          className="text-sm text-slate-500 transition hover:text-slate-800"
        >
          {t.backToHome}
        </Link>

        <h1 className="mt-3 mb-2 text-4xl font-bold tracking-tight">
          {t.title}
        </h1>
        <p className="mb-1.5 text-lg leading-8 text-slate-600">{t.subtitle}</p>
        <p className="mb-6 text-sm leading-6 text-slate-500">
          {t.repaymentMethodsHelp}
        </p>

        <Suspense fallback={null}>
          <MortgageCalculator
            locale={locale}
            labels={t}
            marketData={marketData}
          />
        </Suspense>
      </section>
    </main>
  );
}
