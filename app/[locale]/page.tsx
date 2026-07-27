import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
import { getMarketSnapshot } from "@/lib/market-data/get-market-snapshot";
import MarketSnapshotCards from "@/components/MarketSnapshotCards";
import { getDictionary } from "./dictionaries";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getDictionary(locale);
  const t = dict.home;
  // Never throws: source failures degrade to dated fallback values.
  const marketSnapshot = await getMarketSnapshot();

  return (
    <main className="bg-slate-50 text-slate-900">
      <section className="mx-auto max-w-5xl px-6 pt-10 pb-8 sm:pt-16 sm:pb-12">
        <h1 className="mb-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-5xl">
          {t.heroTitle}
        </h1>

        <p className="mb-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
          {t.heroSubtitle}
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/${locale}/calculator`}
            className="rounded-xl bg-slate-900 px-6 py-3 text-center font-medium text-white transition hover:bg-slate-700"
          >
            {t.heroPrimaryCta}
          </Link>

          <a
            href="#cards"
            className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-center font-medium text-slate-900 transition hover:bg-slate-100"
          >
            {t.heroSecondaryCta}
          </a>
        </div>

        <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-500">
          {t.heroTrustNote}
        </p>
      </section>

      <section id="cards" className="mx-auto max-w-5xl px-6 pb-12">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-2 text-lg font-bold">{t.calcCardTitle}</h2>
            <p className="mb-4 flex-1 text-sm leading-6 text-slate-600">
              {t.calcCardBody}
            </p>
            <Link
              href={`/${locale}/calculator`}
              className="rounded-lg bg-slate-900 px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-slate-700"
            >
              {t.calcCardCta}
            </Link>
          </div>

          <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">{t.compareCardTitle}</h2>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                {t.comingSoonBadge}
              </span>
            </div>
            <p className="mb-4 flex-1 text-sm leading-6 text-slate-600">
              {t.compareCardBody}
            </p>
            <Link
              href={`/${locale}/compare`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              {t.comingSoonCta}
            </Link>
          </div>

          <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">{t.savedCardTitle}</h2>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                {t.comingSoonBadge}
              </span>
            </div>
            <p className="mb-4 flex-1 text-sm leading-6 text-slate-600">
              {t.savedCardBody}
            </p>
            <Link
              href={`/${locale}/saved`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              {t.comingSoonCta}
            </Link>
          </div>
        </div>
      </section>

      {/* Calmer, supporting-context framing: a softly tinted panel and a
          smaller heading (tuned in MarketSnapshotCards) so this reads as
          background context, not the main product. */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <div className="rounded-3xl bg-slate-100/60 p-5 sm:p-8">
          <MarketSnapshotCards
            snapshot={marketSnapshot}
            labels={dict.market}
            locale={locale}
          />
        </div>
      </section>
    </main>
  );
}
