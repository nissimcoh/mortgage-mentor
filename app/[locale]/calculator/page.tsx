import { BRAND_NAME } from "@/lib/brand";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
import { getCalculatorRateSnapshot } from "@/lib/market-data/get-market-snapshot";
import { getMortgageForecastData } from "@/lib/market-data/sources/boi-mortgage-forecast";
import { getMakamAnchorData } from "@/lib/market-data/sources/boi-makam";
import { buildCalculatorMarketData } from "@/lib/market-data/build-calculator-market-data";
import {
  buildTrustedEditContext,
  computeCalculatorInstanceKey,
  extractSavedScenarioIdParam,
  isEditContextUnavailable,
  type TrustedEditContext,
} from "@/lib/scenarios/edit-context";
import { createClient } from "@/lib/supabase/server";
import MortgageCalculator from "@/components/MortgageCalculator";
import { pageAlternates } from "@/lib/site";
import { getDictionary } from "../dictionaries";

/**
 * Resolves calculator edit mode server-side, never from URL metadata
 * alone: savedScenarioId is only a lookup key, so the name and
 * concurrency token (updatedAt) shown in the UI always come from a
 * fresh, RLS-scoped row read for the currently authenticated user.
 * Returns null uniformly whether the caller is signed out, the id is
 * malformed, the scenario doesn't exist, or it belongs to someone else —
 * these cases must never be distinguishable to the client.
 */
async function resolveEditContext(
  query: Record<string, string | string[] | undefined>,
): Promise<TrustedEditContext | null> {
  const savedScenarioIdParam = extractSavedScenarioIdParam(query);
  if (!savedScenarioIdParam) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS's "select own scenarios" policy is the real ownership boundary;
  // .eq("user_id", ...) is the normal, expected app-level filter on top
  // of it, using the signed-in user's own session — never a service-role
  // key.
  const { data: row, error } = await supabase
    .from("mortgage_scenarios")
    .select("id, name, updated_at")
    .eq("id", savedScenarioIdParam)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    // Safe fields only — the user never sees this raw error, only the
    // generic "couldn't be loaded for editing" notice.
    console.error("[calculator] failed to load scenario for edit mode:", {
      code: error.code,
      message: error.message,
      hint: error.hint,
    });
  }

  return buildTrustedEditContext(row);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getDictionary(locale);
  return {
    title: `${dict.calculator.title} | ${BRAND_NAME}`,
    description: dict.calculator.subtitle,
    alternates: pageAlternates(locale, "/calculator"),
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
  // explicitly requested historical curves, including real yields for
  // variable CPI-linked tracks.
  const [marketSnapshot, forecastData, makamData, editContext] =
    await Promise.all([
      getCalculatorRateSnapshot(),
      getMortgageForecastData(requestedCurveIds),
      getMakamAnchorData(requestedMakamIds),
      resolveEditContext(query),
    ]);
  const marketData = buildCalculatorMarketData(
    marketSnapshot,
    forecastData,
    makamData,
  );
  const editContextUnavailable = isEditContextUnavailable(query, editContext);
  const calculatorInstanceKey = computeCalculatorInstanceKey(editContext);

  return (
    <main className="bg-transparent text-slate-900">
      <section className="mx-auto max-w-6xl px-4 pt-5 pb-14 sm:px-6 sm:pt-14">
        <Link
          href={`/${locale}`}
          className="hidden items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-900 sm:inline-flex"
        >
          {t.backToHome}
        </Link>

        <h1 className="mt-3 mb-2 text-3xl font-semibold tracking-tight sm:mt-4 sm:mb-3 sm:text-6xl">
          {t.title}
        </h1>
        {/* Kept short so the form starts on the first screen; the longer
            explanation of repayment methods lives in the form's field help. */}
        <p className="mb-5 max-w-3xl text-base leading-7 text-slate-500 sm:mb-8 sm:text-xl sm:leading-8">{t.subtitle}</p>

        {/* This route already awaits searchParams and renders dynamically.
            Keep its form in the initial page instead of an empty streamed
            boundary, so direct navigation never shows a header-only shell. */}
        <MortgageCalculator
          key={calculatorInstanceKey}
          locale={locale}
          labels={t}
          marketData={marketData}
          saveScenarioLabels={dict.saveScenarioDialog}
          editScenarioLabels={dict.editScenarioDialog}
          editContext={editContext}
          editContextUnavailable={editContextUnavailable}
        />
      </section>
    </main>
  );
}
