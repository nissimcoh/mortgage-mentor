import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
import LearningGlossary from "@/components/LearningGlossary";
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
    <main className="bg-transparent text-slate-900">
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

        <LearningGlossary labels={t} />
        <aside className="glass-panel mt-8 p-6">
          <h2 className="font-semibold">{t.sourceTitle}</h2>
          <ul className="mt-3 space-y-3 text-sm text-accent">
            <li><a className="underline underline-offset-4" href="https://www.boi.org.il/information/bank-paymnts/financial-education/הרפורמה-להגברת-שקיפות-המידע-והתחרות-במשכנתאות/" target="_blank" rel="noreferrer">{t.sourceGuide}</a></li>
            <li><a className="underline underline-offset-4" href="https://www.boi.org.il/information/interestrates/" target="_blank" rel="noreferrer">{t.sourceFees}</a></li>
          </ul>
          <Link href={`/${locale}/calculator`} className="glass-button mt-6 inline-block rounded-xl px-5 py-3 text-sm font-medium text-white">{dict.home.calcCardCta}</Link>
        </aside>
      </section>
    </main>
  );
}
