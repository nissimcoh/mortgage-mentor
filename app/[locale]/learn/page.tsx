import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
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
    title: `${dict.nav.learn} | MortgageMentor`,
    description: dict.learnPage.intro,
  };
}

export default async function LearnPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getDictionary(locale);
  const t = dict.learnPage;

  return (
    <main className="bg-slate-50 text-slate-900">
      <section className="mx-auto max-w-5xl px-6 pt-10 pb-16 sm:pt-12">
        <Link
          href={`/${locale}`}
          className="text-sm text-slate-500 transition hover:text-slate-800"
        >
          {dict.calculator.backToHome}
        </Link>

        <h1 className="mt-3 mb-2 text-3xl font-bold tracking-tight sm:text-4xl">
          {t.title}
        </h1>
        <p className="mb-8 max-w-2xl text-lg leading-8 text-slate-600">
          {t.intro}
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {t.topics.map((topic) => (
            <div
              key={topic}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <h2 className="text-base font-bold leading-6">{topic}</h2>
                <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                  {dict.home.comingSoonBadge}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
