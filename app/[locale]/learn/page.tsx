import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
import LearningGlossary from "@/components/LearningGlossary";
import RuleCardContent from "@/components/RuleCardContent";
import { pageAlternates } from "@/lib/site";
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
    alternates: pageAlternates(locale, "/learn"),
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
      <section className="mx-auto max-w-5xl px-4 pt-8 pb-16 sm:px-6 sm:pt-14">
        <Link
          href={`/${locale}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-900"
        >
          {dict.calculator.backToHome}
        </Link>

        <h1 className="mt-4 mb-3 text-4xl font-semibold tracking-tight sm:text-6xl">
          {t.title}
        </h1>
        <p className="mb-12 max-w-2xl text-lg leading-8 text-slate-500 sm:text-xl">
          {t.intro}
        </p>

        <section aria-labelledby="rules-title" className="mb-14">
          <h2 id="rules-title" className="scroll-mt-20 text-2xl font-semibold tracking-tight sm:text-3xl">{t.rulesTitle}</h2>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-500">{t.rulesIntro}</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {t.rules.map((rule) => (
              <li key={rule.termId + rule.value}>
                <a href={`#${rule.termId}`} className="glass-panel lift flex h-full p-5 sm:p-6">
                  <RuleCardContent rule={rule} />
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 max-w-3xl text-xs leading-5 text-slate-500">{t.rulesAsOf}</p>
        </section>

        <LearningGlossary labels={t} />
        <aside className="glass-panel mt-10 p-6 sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight">{t.sourceTitle}</h2>
          <ul className="mt-3 space-y-3 text-sm text-accent">
            <li><a className="underline underline-offset-4" href="https://www.boi.org.il/information/bank-paymnts/financial-education/הרפורמה-להגברת-שקיפות-המידע-והתחרות-במשכנתאות/" target="_blank" rel="noreferrer">{t.sourceGuide}</a></li>
            <li><a className="underline underline-offset-4" href="https://www.boi.org.il/information/interestrates/" target="_blank" rel="noreferrer">{t.sourceFees}</a></li>
            <li><a className="underline underline-offset-4" href="https://www.gov.il/he/departments/units/housing_assistance_moch" target="_blank" rel="noreferrer">{t.sourceEligibility}</a></li>
          </ul>
          <Link href={`/${locale}/calculator`} className="glass-button mt-6 inline-flex min-h-11 items-center px-6 text-[15px] font-medium text-white">{dict.home.calcCardCta}</Link>
        </aside>
      </section>
    </main>
  );
}
