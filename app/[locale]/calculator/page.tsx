import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
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
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getDictionary(locale);
  const t = dict.calculator;

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
          <MortgageCalculator locale={locale} labels={t} />
        </Suspense>
      </section>
    </main>
  );
}
