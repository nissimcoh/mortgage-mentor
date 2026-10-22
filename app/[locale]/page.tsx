import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { isValidLocale, type Locale } from "@/lib/i18n/config";
import { getMarketSnapshot } from "@/lib/market-data/get-market-snapshot";
import { getMortgageForecastData } from "@/lib/market-data/sources/boi-mortgage-forecast";
import HeroPaymentIllustration from "@/components/HeroPaymentIllustration";
import MarketSnapshotCards from "@/components/MarketSnapshotCards";
import MarketSnapshotSkeleton from "@/components/MarketSnapshotSkeleton";
import { revealDelay } from "@/lib/ui/reveal-delay";
import { getDictionary, type Dictionary } from "./dictionaries";

async function HomeMarketData({ locale, labels }: { locale: Locale; labels: Dictionary["market"] }) {
  // Only this section depends on request-time data. Keep the hero and
  // calculator link available while a cold cache fetches official sources.
  // Still evaluate freshness per request rather than caching fallback HTML.
  await connection();
  const [snapshot, forecast] = await Promise.all([
    getMarketSnapshot(), getMortgageForecastData(),
  ]);
  return <MarketSnapshotCards snapshot={snapshot} curve={forecast.curves[0]} labels={labels} locale={locale} />;
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const t = dict.home;
  const tools = [
    { href: "calculator", title: t.calcCardTitle, body: t.calcCardBody, cta: t.calcCardCta, glyph: "₪" },
    { href: "learn", title: t.learnCardTitle, body: t.learnCardBody.replace("{count}", String(dict.learnPage.entries.length)), cta: t.learnCardCta, glyph: "✎" },
    { href: "saved", title: t.savedCardTitle, body: t.savedCardBody, cta: t.savedCardCta, glyph: "☆" },
  ];
  const rules = dict.learnPage.rules.slice(0, 3);

  return (
    <main className="mx-auto max-w-6xl px-5 pb-16 pt-8 text-slate-900 sm:px-8 sm:pt-12">
      <section className="grid items-center gap-8 pb-10 lg:grid-cols-[1.3fr_1fr] lg:gap-12 sm:pb-14">
        <div className="py-3 sm:py-6">
          <p className="mm-reveal mb-5 text-sm font-semibold tracking-wide text-accent">{t.eyebrow}</p>
          <h1 className="mm-reveal whitespace-pre-line text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl" style={revealDelay(0.05)}>{t.heroTitle}</h1>
          <p className="mm-reveal mt-5 max-w-xl text-lg leading-8 text-slate-600" style={revealDelay(0.1)}>{t.heroSubtitle}</p>
          <div className="mm-reveal mt-7 flex flex-col gap-3 sm:flex-row" style={revealDelay(0.15)}>
            <Link href={`/${locale}/calculator`} className="glass-button rounded-2xl px-7 py-3.5 text-center font-semibold text-white">{t.heroPrimaryCta}</Link>
            <Link href={`/${locale}/learn`} className="glass-secondary rounded-2xl px-6 py-3.5 text-center font-semibold">{t.heroLearnCta}</Link>
          </div>
          <p className="mm-reveal mt-5 max-w-lg text-xs leading-6 text-slate-500" style={revealDelay(0.2)}>{t.heroTrustNote}</p>
        </div>
        <HeroPaymentIllustration labels={t} />
      </section>

      <section id="market" className="mm-scroll-reveal scroll-mt-24 pb-12">
        <Suspense fallback={<MarketSnapshotSkeleton labels={dict.market} />}>
          <HomeMarketData locale={locale} labels={dict.market} />
        </Suspense>
      </section>

      <section aria-labelledby="rules-title" className="mm-scroll-reveal pb-12">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="rules-title" className="text-xl font-bold tracking-tight sm:text-2xl">{dict.learnPage.rulesTitle}</h2>
          <Link href={`/${locale}/learn#rules-title`} className="text-sm font-medium text-accent underline decoration-accent/30 underline-offset-4">{t.rulesMoreCta}</Link>
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {rules.map((rule) => (
            <li key={rule.termId}>
              <Link href={`/${locale}/learn#${rule.termId}`} className="glass-panel flex h-full items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:ring-2 hover:ring-accent/25 sm:p-5">
                <span className="min-w-12 text-2xl font-bold tracking-tight text-accent"><bdi>{rule.value}</bdi></span>
                <span className="text-sm leading-6 text-slate-700">{rule.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="tools-title" className="mm-scroll-reveal">
        <h2 id="tools-title" className="text-xl font-bold tracking-tight sm:text-2xl">{t.toolsTitle}</h2>
        <ul className="mt-4 grid gap-3 md:grid-cols-3">
          {tools.map((tool) => (
            <li key={tool.href}>
              <Link href={`/${locale}/${tool.href}`} className="glass-panel group flex h-full items-start gap-4 p-4 transition hover:-translate-y-0.5 hover:ring-2 hover:ring-accent/25 sm:p-5">
                <span aria-hidden="true" className="glass-active flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg">{tool.glyph}</span>
                <span className="flex-1">
                  <span className="block font-bold">{tool.title}</span>
                  <span className="mt-1 block text-sm leading-6 text-slate-600">{tool.body}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent">
                    {tool.cta}
                    <span aria-hidden="true" className="transition group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5">→</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
