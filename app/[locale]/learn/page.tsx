import { BRAND_NAME } from "@/lib/brand";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
import LearningGlossary from "@/components/LearningGlossary";
import Icon from "@/components/Icon";
import RuleCardContent from "@/components/RuleCardContent";
import { revealDelay } from "@/lib/ui/reveal-delay";
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
    title: `${dict.nav.learn} | ${BRAND_NAME}`,
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
    <main className="text-slate-900">
      <section className="bg-white">
        <div className="mx-auto max-w-5xl px-5 pb-12 pt-10 text-center sm:px-6 sm:pb-20 sm:pt-20">
          <p className="mm-reveal text-sm font-semibold text-accent">{dict.nav.learn}</p>
          <h1 className="mm-reveal mt-3 text-4xl font-bold leading-[1.06] tracking-[-0.02em] sm:text-7xl" style={revealDelay(0.05)}>
            {t.title}
          </h1>
          <p className="mm-reveal mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-500 sm:text-2xl sm:leading-9" style={revealDelay(0.1)}>
            {t.intro}
          </p>
          <div className="mm-reveal mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-3" style={revealDelay(0.15)}>
            <a href="#glossary-title" className="glass-button inline-flex min-h-12 items-center px-7 text-[17px] font-medium text-white">{t.glossaryJump}</a>
            <a href="#rules-title" className="group inline-flex items-center gap-1 text-[17px] font-medium text-accent hover:underline hover:underline-offset-4">
              {t.rulesTitle}
              <Icon name="chevron" size={14} strokeWidth={2.2} className="rtl:-scale-x-100" />
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16 pt-12 sm:px-6 sm:pt-20">
        <section aria-labelledby="topics-title" className="mb-16">
          <h2 id="topics-title" className="text-2xl font-semibold tracking-tight sm:text-4xl">{t.topicsTitle}</h2>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-500 sm:text-lg">{t.topicsIntro}</p>
          <ol className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {t.topics.map((topic, index) => (
              <li key={topic} className="glass-panel mm-scroll-reveal p-6">
                <p aria-hidden="true" className="text-sm font-semibold tabular-nums text-accent">{String(index + 1).padStart(2, "0")}</p>
                <h3 className="mt-3 text-lg font-semibold tracking-tight">{topic}</h3>
                <p className="mt-2 text-[15px] leading-7 text-slate-600">{t.topicBodies[index]}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="rules-title" className="mb-16">
          <h2 id="rules-title" className="scroll-mt-20 text-2xl font-semibold tracking-tight sm:text-4xl">{t.rulesTitle}</h2>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-500 sm:text-lg">{t.rulesIntro}</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {t.rules.map((rule) => (
              <li key={rule.termId + rule.value}>
                <a href={`#${rule.termId}`} className="glass-panel lift flex h-full p-5 sm:p-6">
                  <RuleCardContent rule={rule} />
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-4 max-w-3xl text-xs leading-5 text-slate-500">{t.rulesAsOf}</p>
        </section>

        <LearningGlossary labels={t} />

        <aside className="glass-panel mt-12 p-6 sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight">{t.sourceTitle}</h2>
          <ul className="mt-3 space-y-3 text-[15px] text-accent">
            <li><a className="hover:underline hover:underline-offset-4" href="https://www.boi.org.il/information/bank-paymnts/financial-education/הרפורמה-להגברת-שקיפות-המידע-והתחרות-במשכנתאות/" target="_blank" rel="noreferrer">{t.sourceGuide}</a></li>
            <li><a className="hover:underline hover:underline-offset-4" href="https://www.boi.org.il/information/interestrates/" target="_blank" rel="noreferrer">{t.sourceFees}</a></li>
            <li><a className="hover:underline hover:underline-offset-4" href="https://www.gov.il/he/departments/units/housing_assistance_moch" target="_blank" rel="noreferrer">{t.sourceEligibility}</a></li>
          </ul>
        </aside>

        <div className="bento bento-dark mt-4 flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
          <p className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{t.ctaTitle}</p>
          <Link href={`/${locale}/calculator`} className="inline-flex min-h-12 shrink-0 items-center rounded-full bg-white px-7 text-[17px] font-medium text-black transition-colors hover:bg-slate-200">{dict.home.calcCardCta}</Link>
        </div>
      </section>
    </main>
  );
}
