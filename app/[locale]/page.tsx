import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isValidLocale, type Locale } from "@/lib/i18n/config";
import { getMarketSnapshot } from "@/lib/market-data/get-market-snapshot";
import { getMortgageForecastData } from "@/lib/market-data/sources/boi-mortgage-forecast";
import HeroSimulator from "@/components/home/HeroSimulator";
import HomeFreshness from "@/components/home/HomeFreshness";
import MortgageStory from "@/components/home/MortgageStory";
import Icon, { type IconName } from "@/components/Icon";
import MarketSnapshotCards from "@/components/MarketSnapshotCards";
import MarketSnapshotSkeleton from "@/components/MarketSnapshotSkeleton";
import RuleCardContent from "@/components/RuleCardContent";
import { revealDelay } from "@/lib/ui/reveal-delay";
import { TRACK_COLORS } from "@/lib/ui/track-colors";
import { pageAlternates, SITE_URL } from "@/lib/site";
import { getDictionary, type Dictionary } from "./dictionaries";

/**
 * The home page is prerendered and served from the CDN close to the visitor,
 * instead of being rendered per request in the functions region (Sydney, next
 * to the database, which this page never reads). Vercel rebuilds it in the
 * background at most this often. Must stay a literal: Next.js reads it
 * statically.
 */
export const revalidate = 300;
const REVALIDATE_SECONDS = 300;

async function HomeMarketData({ locale, labels, eyebrow }: { locale: Locale; labels: Dictionary["market"]; eyebrow: string }) {
  // Rendered when the page is (re)built, at most every REVALIDATE_SECONDS,
  // not per request. The sources themselves are cached for a day, so a
  // rebuild is cheap; it re-evaluates freshness and which curve is active.
  // HomeFreshness covers the gap when a visitor receives an older copy.
  const [snapshot, forecast] = await Promise.all([
    getMarketSnapshot(), getMortgageForecastData(),
  ]);
  return (
    <>
      <MarketSnapshotCards snapshot={snapshot} curve={forecast.curves[0]} labels={labels} locale={locale} eyebrow={eyebrow} />
      <HomeFreshness renderedAt={snapshot.fetchedAt} maxAgeSeconds={REVALIDATE_SECONDS} />
    </>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();
  return { alternates: pageAlternates(locale, "") };
}

const FEATURE_ICONS: IconName[] = ["layers", "chart", "table", "shield", "bookmark", "share"];

/** Section heading used down the page: small label, large title, optional copy. */
function SectionHeading({ id, eyebrow, title, body, action }: {
  id: string; eyebrow?: string; title: string; body?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="max-w-3xl">
        {eyebrow && <p className="text-sm font-semibold text-accent">{eyebrow}</p>}
        <h2 id={id} className="mt-1.5 text-3xl font-semibold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl">{title}</h2>
        {body && <p className="mt-3 text-base leading-7 text-slate-500 sm:text-lg">{body}</p>}
      </div>
      {action}
    </div>
  );
}

function Chevron() {
  return <Icon name="chevron" size={14} strokeWidth={2.2} className="transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />;
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const t = dict.home;
  const tools: { href: string; title: string; body: string; cta: string; icon: IconName }[] = [
    { href: "calculator", title: t.calcCardTitle, body: t.calcCardBody, cta: t.calcCardCta, icon: "calculator" },
    { href: "learn", title: t.learnCardTitle, body: t.learnCardBody.replace("{count}", String(dict.learnPage.entries.length)), cta: t.learnCardCta, icon: "book" },
    { href: "saved", title: t.savedCardTitle, body: t.savedCardBody, cta: t.savedCardCta, icon: "bookmark" },
  ];
  const rules = dict.learnPage.rules.slice(0, 3);
  const [mixFeature, forecastFeature, ...smallFeatures] = t.highlights;
  // Structured data: tells search engines this is a free finance web app.
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "MortgageMentor",
    alternateName: dict.metadata.applicationName,
    url: `${SITE_URL}/${locale}`,
    description: dict.metadata.description,
    inLanguage: locale,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "ILS" },
  };

  return (
    <main className="text-slate-900">
      {/* Static, server-built JSON; "<" is escaped so it cannot close the tag. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 pb-12 pt-14 text-center sm:px-8 sm:pb-16 sm:pt-24">
          <p className="mm-reveal text-sm font-semibold text-accent sm:text-base">{t.eyebrow}</p>
          <h1 className="mm-reveal mt-4 whitespace-pre-line text-[clamp(1.75rem,7.6vw,5.25rem)] font-bold leading-[1.04] tracking-[-0.025em]" style={revealDelay(0.05)}>{t.heroTitle}</h1>
          <p className="mm-reveal mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-500 sm:text-2xl sm:leading-9" style={revealDelay(0.1)}>{t.heroSubtitle}</p>
          <div className="mm-reveal mt-8 flex flex-col items-center justify-center gap-x-7 gap-y-4 sm:flex-row" style={revealDelay(0.15)}>
            <Link href={`/${locale}/calculator`} className="glass-button inline-flex min-h-12 items-center px-7 text-[17px] font-medium">{t.heroPrimaryCta}</Link>
            <Link href={`/${locale}/learn`} className="group inline-flex items-center gap-1 text-[17px] font-medium text-accent hover:underline hover:underline-offset-4">{t.heroLearnCta}<Chevron /></Link>
          </div>
          <p className="mm-reveal mx-auto mt-6 max-w-lg text-xs leading-5 text-slate-500" style={revealDelay(0.2)}>{t.heroTrustNote}</p>
        </div>
        <div className="mm-reveal mx-auto max-w-6xl px-3 pb-14 sm:px-8 sm:pb-24" style={revealDelay(0.25)}>
          <HeroSimulator locale={locale} labels={t} />
        </div>
      </section>

      <MortgageStory locale={locale} labels={t} />

      <section id="market" className="scroll-mt-16 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <Suspense fallback={<MarketSnapshotSkeleton labels={dict.market} eyebrow={t.marketEyebrow} />}>
            <HomeMarketData locale={locale} labels={dict.market} eyebrow={t.marketEyebrow} />
          </Suspense>
        </div>
      </section>

      <section aria-labelledby="features-title" className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <SectionHeading id="features-title" eyebrow={t.highlightsEyebrow} title={t.highlightsTitle} />
          <ul className="mt-8 grid gap-3 sm:mt-12 sm:gap-4 lg:grid-cols-12">
            <li className="bento mm-scroll-reveal lg:col-span-7">
              <FeatureText icon={FEATURE_ICONS[0]} feature={mixFeature} large />
              <div aria-hidden="true" className="mt-8">
                <div className="flex h-12 gap-1 overflow-hidden rounded-2xl">
                  {[34, 26, 18, 12, 10].map((share, index) => (
                    <span key={index} className="mm-grow h-full ltr:origin-left rtl:origin-right" style={{ width: `${share}%`, backgroundColor: TRACK_COLORS[index] }} />
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[11px] tabular-nums text-slate-400"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
              </div>
            </li>
            <li className="bento bento-dark mm-scroll-reveal lg:col-span-5">
              <FeatureText icon={FEATURE_ICONS[1]} feature={forecastFeature} large dark />
              <svg aria-hidden="true" viewBox="0 0 320 96" className="mt-8 w-full">
                <path d="M4 70 C 40 66, 70 40, 110 36 S 170 46, 196 50" fill="none" stroke="#6fd6bd" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M196 50 C 230 56, 270 30, 316 22" fill="none" stroke="#6fd6bd" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2 7" />
                <path d="M196 50 C 230 56, 270 30, 316 22 L 316 62 C 270 66, 230 74, 196 50 Z" fill="#6fd6bd" fillOpacity=".12" />
                <circle cx="196" cy="50" r="5" fill="#0b0b0c" stroke="#6fd6bd" strokeWidth="2.5" />
              </svg>
            </li>
            {smallFeatures.map((feature, index) => (
              <li key={feature.title} className="bento mm-scroll-reveal lg:col-span-3">
                <FeatureText icon={FEATURE_ICONS[index + 2]} feature={feature} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="rules-title" className="py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <SectionHeading id="rules-title" eyebrow={t.rulesEyebrow} title={dict.learnPage.rulesTitle}
            action={<Link href={`/${locale}/learn#rules-title`} className="group inline-flex items-center gap-1 text-[15px] font-medium text-accent hover:underline hover:underline-offset-4">{t.rulesMoreCta}<Chevron /></Link>} />
          <ul className="mt-8 grid gap-3 sm:mt-12 sm:grid-cols-3 sm:gap-4">
            {rules.map((rule) => (
              <li key={rule.termId} className="mm-scroll-reveal">
                <Link href={`/${locale}/learn#${rule.termId}`} className="glass-panel lift flex h-full p-6 sm:p-7">
                  <RuleCardContent rule={rule} size="large" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="tools-title" className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <SectionHeading id="tools-title" title={t.toolsTitle} />
          <ul className="mt-8 grid gap-3 sm:mt-12 sm:gap-4 md:grid-cols-3">
            {tools.map((tool) => (
              <li key={tool.href} className="mm-scroll-reveal">
                <Link href={`/${locale}/${tool.href}`} className="bento lift group flex h-full flex-col">
                  <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-accent shadow-sm"><Icon name={tool.icon} size={22} /></span>
                  <span className="mt-5 block text-xl font-semibold tracking-tight">{tool.title}</span>
                  <span className="mt-2 block flex-1 text-[15px] leading-6 text-slate-500">{tool.body}</span>
                  <span className="mt-5 inline-flex items-center gap-1 text-[15px] font-medium text-accent">{tool.cta}<Chevron /></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="final-title" className="px-5 py-20 text-center sm:py-32">
        <h2 id="final-title" className="mm-scroll-reveal text-4xl font-bold leading-[1.05] tracking-[-0.02em] sm:text-7xl">{t.finalTitle}</h2>
        <p className="mm-scroll-reveal mx-auto mt-4 max-w-xl text-lg text-slate-500 sm:text-2xl">{t.finalBody}</p>
        <Link href={`/${locale}/calculator`} className="glass-button mt-8 inline-flex min-h-12 items-center px-7 text-[17px] font-medium">{t.heroPrimaryCta}</Link>
      </section>
    </main>
  );
}

function FeatureText({ icon, feature, large, dark }: { icon: IconName; feature: { title: string; body: string }; large?: boolean; dark?: boolean }) {
  return (
    <>
      <span aria-hidden="true" className={`flex h-10 w-10 items-center justify-center rounded-xl ${dark ? "bg-white/10 text-[#6fd6bd]" : "bg-white text-accent shadow-sm"}`}><Icon name={icon} size={20} /></span>
      <h3 className={`mt-5 font-semibold tracking-tight ${large ? "text-2xl sm:text-3xl" : "text-lg"} ${dark ? "text-white" : "text-slate-900"}`}>{feature.title}</h3>
      <p className={`mt-2 leading-6 ${large ? "max-w-md text-base" : "text-[15px]"} ${dark ? "text-white/60" : "text-slate-500"}`}>{feature.body}</p>
    </>
  );
}
