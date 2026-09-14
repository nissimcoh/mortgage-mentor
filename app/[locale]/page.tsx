import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
import { getMarketSnapshot } from "@/lib/market-data/get-market-snapshot";
import { getMortgageForecastData } from "@/lib/market-data/sources/boi-mortgage-forecast";
import MarketSnapshotCards from "@/components/MarketSnapshotCards";
import { getDictionary } from "./dictionaries";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();
  // Render stored data without caching a fallback HTML page.
  await connection();
  const dict = await getDictionary(locale);
  const t = dict.home;
  const [snapshot, forecast] = await Promise.all([
    getMarketSnapshot(), getMortgageForecastData(),
  ]);
  const tools = [
    { href: "calculator", title: t.calcCardTitle, body: t.calcCardBody, cta: t.calcCardCta, icon: "01" },
    { href: "learn", title: t.learnCardTitle, body: t.learnCardBody, cta: t.learnCardCta, icon: "02" },
    { href: "saved", title: t.savedCardTitle, body: t.savedCardBody, cta: t.savedCardCta, icon: "03" },
  ];

  return (
    <main className="mx-auto max-w-6xl px-5 pb-16 pt-8 text-slate-900 sm:px-8 sm:pt-12">
      <section className="grid items-center gap-8 pb-10 lg:grid-cols-[1.3fr_1fr] lg:gap-12 sm:pb-14">
        <div className="py-3 sm:py-6">
          <p className="mb-5 text-sm font-semibold tracking-wide text-accent">{t.eyebrow}</p>
          <h1 className="whitespace-pre-line text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">{t.heroTitle}</h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">{t.heroSubtitle}</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href={`/${locale}/calculator`} className="glass-button rounded-2xl px-7 py-3.5 text-center font-semibold text-white">{t.heroPrimaryCta}</Link>
            <a href="#market" className="glass-secondary rounded-2xl px-6 py-3.5 text-center font-medium">{t.heroSecondaryCta}</a>
          </div>
          <p className="mt-5 max-w-lg text-xs leading-6 text-slate-500">{t.heroTrustNote}</p>
        </div>
        <aside className="glass-hero p-6 sm:p-8" aria-labelledby="overview-title">
          <h2 id="overview-title" className="mb-6 text-xl font-bold">{t.overviewTitle}</h2>
          <ol className="space-y-5">
            {t.overviewItems.map((item, index) => (
              <li key={item.title} className="flex items-start gap-4">
                <span aria-hidden="true" className="glass-active flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold">0{index + 1}</span>
                <div><h3 className="font-semibold">{item.title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{item.body}</p></div>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <section id="market" className="scroll-mt-24 pb-12">
        <MarketSnapshotCards snapshot={snapshot} curve={forecast.curves[0]} labels={dict.market} locale={locale} />
        <form action={`/${locale}`} method="get"><button type="submit" className="glass-secondary mt-4 inline-block rounded-xl px-4 py-2.5 text-sm font-medium">{dict.market.refreshNow}</button></form>
      </section>

      <section aria-labelledby="tools-title">
        <h2 id="tools-title" className="text-2xl font-bold tracking-tight">{t.toolsTitle}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{t.toolsSubtitle}</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {tools.map((tool) => (
            <article key={tool.href} className="glass-panel flex flex-col p-6">
              <span aria-hidden="true" className="mb-6 text-sm font-medium text-accent">{tool.icon}</span>
              <h3 className="text-lg font-bold">{tool.title}</h3>
              <p className="mb-6 mt-2 flex-1 text-sm leading-7 text-slate-600">{tool.body}</p>
              <Link href={`/${locale}/${tool.href}`} className="glass-secondary rounded-xl px-4 py-3 text-center text-sm font-semibold">{tool.cta}</Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
