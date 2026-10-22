import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { MarketSnapshot } from "@/lib/market-data/types";
import type { MortgageForecastCurveSnapshot } from "@/lib/market-data/mortgage-forecast-types";
import { BOI_RATE_SERIES_URL } from "@/lib/market-data/sources/bank-of-israel";
import { CBS_CPI_URL } from "@/lib/market-data/sources/cbs";
import { FORECAST_WORKBOOK_URL } from "@/lib/market-data/sources/boi-mortgage-forecast";
import { isStale } from "@/lib/market-data/derive";
import { revealDelay } from "@/lib/ui/reveal-delay";

type MarketLabels = Dictionary["market"];

function StatusChip({ live, stale, fallback, labels }: {
  live: boolean; stale: boolean; fallback: string; labels: MarketLabels;
}) {
  return <span className={`inline-block rounded-full border px-2.5 py-1 text-xs ${live && !stale ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
    {!live ? fallback : stale ? labels.statusStale : labels.statusLive}
  </span>;
}

/** Compact status for the headline tiles; the full chip lives in the details panel. */
function StatusDot({ live, stale, fallback, labels }: {
  live: boolean; stale: boolean; fallback: string; labels: MarketLabels;
}) {
  const ok = live && !stale;
  const text = !live ? fallback : stale ? labels.statusStale : labels.statusLive;
  return <span title={text} className={`h-2 w-2 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`}><span className="sr-only">{text}</span></span>;
}

/** Server-rendered source values: never substitutes staff forecasts for the calculator curve. */
export default function MarketSnapshotCards({ snapshot, curve, labels, locale }: {
  snapshot: MarketSnapshot;
  curve?: MortgageForecastCurveSnapshot;
  labels: MarketLabels;
  locale: Locale;
}) {
  const intlLocale = locale === "he" ? "he-IL" : "en-US";
  const percent = new Intl.NumberFormat(intlLocale, { style: "percent", maximumFractionDigits: 2 });
  const signedPercent = new Intl.NumberFormat(intlLocale, { style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero" });
  const dateFormat = new Intl.DateTimeFormat(intlLocale, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jerusalem" });
  const monthFormat = new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric", timeZone: "Asia/Jerusalem" });
  const formatDate = (iso: string) => dateFormat.format(new Date(iso));
  const checkedFormat = new Intl.DateTimeFormat(intlLocale, { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });
  const fallback = `${labels.statusFallbackPrefix}${formatDate(snapshot.fallbackVerifiedAt)}`;
  const cpiMonth = monthFormat.format(new Date(Date.UTC(snapshot.cpi.referenceYear, snapshot.cpi.referenceMonth - 1, 1)));
  const rateDetail = snapshot.boiRate.isLive
    ? labels.effectiveFrom + formatDate(snapshot.boiRate.effectiveDate)
    : labels.fallbackVerifiedLabel + formatDate(snapshot.fallbackVerifiedAt);
  const rateObservation = snapshot.boiRate.isLive
    ? labels.observedAt + formatDate(snapshot.boiRate.lastObservationDate)
    : null;
  const cards = [
    { label: labels.boiRateLabel, value: percent.format(snapshot.boiRate.ratePercent / 100), detail: rateDetail, secondary: rateObservation, help: labels.boiRateHelp, source: labels.sourceBoi, url: BOI_RATE_SERIES_URL, checkedAt: snapshot.boiRate.fetchedAt, live: snapshot.boiRate.isLive, stale: snapshot.boiRate.isStale },
    { label: labels.primeRateLabel, value: percent.format(snapshot.primeRate.ratePercent / 100), detail: rateDetail, secondary: rateObservation, help: labels.primeRateHelp, source: labels.sourceDerived, url: BOI_RATE_SERIES_URL, checkedAt: snapshot.boiRate.fetchedAt, live: snapshot.primeRate.isLive, stale: snapshot.boiRate.isStale },
    { label: labels.cpiLabel, value: signedPercent.format(snapshot.cpi.monthlyChangePercent / 100), detail: (snapshot.cpi.isLive ? labels.cpiReferenceMonth : labels.cpiFallbackMonth) + cpiMonth, secondary: `${labels.cpiIndexValueLabel}: ${new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 2 }).format(snapshot.cpi.indexValue)}`, help: labels.cpiHelp, source: labels.sourceCbs, url: CBS_CPI_URL, checkedAt: snapshot.cpi.fetchedAt, live: snapshot.cpi.isLive, stale: snapshot.cpi.isStale },
  ];
  const cpiStart = curve?.expectedCpiIndex[0];
  const cpiEnd = curve?.expectedCpiIndex[12];
  const expectedCpi = cpiStart && cpiEnd && Number.isFinite(cpiEnd / cpiStart) ? cpiEnd / cpiStart - 1 : null;
  const curveMonth = curve ? monthFormat.format(new Date(Date.UTC(curve.referenceYear, curve.referenceMonth - 1, 1))) : labels.unavailable;
  const curveLive = curve?.status === "live";
  const curveStale = curve ? (isStale(curve.publicationDate, new Date(snapshot.fetchedAt), 62) || isStale(curve.fetchedAt, new Date(snapshot.fetchedAt), 1)) : false;
  const curveFallback = curve ? labels.curveFallback : labels.unavailable;
  const tiles = [
    ...cards.map((card) => ({ label: card.label, value: card.value, detail: card.detail, live: card.live, stale: card.stale, fallback })),
    { label: labels.expectedCpiTitle, value: expectedCpi === null ? labels.unavailable : signedPercent.format(expectedCpi), detail: labels.expectedCpiDetail.replace("{month}", curveMonth), live: curveLive, stale: curveStale, fallback: curveFallback },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{labels.title}</h2>
      <p className="mb-5 mt-1 max-w-3xl text-sm leading-6 text-slate-600">{labels.subtitle}</p>
      {(snapshot.status !== "live" || snapshot.boiRate.isStale || snapshot.cpi.isStale) && <p role="status" className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{labels.dataWarning}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile, index) => (
          <article key={tile.label} data-source-live={tile.live} className="glass-panel mm-reveal flex flex-col p-4 sm:p-5" style={revealDelay(index * 0.08)}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-xs font-medium leading-5 text-slate-600 sm:text-sm">{tile.label}</h3>
              <span className="mt-1.5"><StatusDot live={tile.live} stale={tile.stale} fallback={tile.fallback} labels={labels} /></span>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"><bdi>{tile.value}</bdi></p>
            <p className="mt-auto pt-2 text-xs leading-5 text-slate-500">{tile.detail}</p>
          </article>
        ))}
      </div>
      {snapshot.nextDecision.at && <p className="mt-3 text-sm text-slate-600"><span className="font-medium text-slate-800">{labels.nextDecisionLabel}:</span> {formatDate(snapshot.nextDecision.at)}</p>}

      <details className="glass-track mt-4 px-4 py-3 sm:px-5">
        <summary className="cursor-pointer text-sm font-medium text-accent">{labels.detailsToggle}</summary>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {cards.map((card) => (
            <section key={card.label} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{card.label}</h3>
                <StatusChip live={card.live} stale={card.stale} fallback={fallback} labels={labels} />
              </div>
              <p className="mt-2 leading-6 text-slate-600">{card.help}</p>
              <p className="mt-1 text-xs text-slate-500">{card.detail}</p>
              {card.secondary && <p className="mt-1 text-xs text-slate-500">{card.secondary}</p>}
              {card.live && card.checkedAt && <p className="mt-1 text-xs text-slate-500">{labels.sourceCheckedAt}<time dateTime={card.checkedAt}>{checkedFormat.format(new Date(card.checkedAt))}</time></p>}
              <a href={card.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-accent underline decoration-accent/30 underline-offset-4">{labels.sourceLabel}: {card.source}</a>
            </section>
          ))}
          <section className="text-sm" data-forecast-status={curve?.status ?? "unavailable"}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{labels.curveTitle}: {curveMonth}</h3>
              <StatusChip live={curveLive} stale={curveStale} fallback={curveFallback} labels={labels} />
            </div>
            <p className="mt-2 leading-6 text-slate-600">{labels.curveHelp} {labels.expectedCpiHelp}</p>
            {curve && <p className="mt-1 text-xs text-slate-500">{curve.averageType === "calendar" ? labels.curveCalendar : labels.curveIndex} · {labels.publicationPrefix}{formatDate(curve.publicationDate)}</p>}
            {curve && <p className="mt-1 text-xs text-slate-500">{labels.effectiveFrom}{formatDate(curve.effectiveDate)}</p>}
            {curveLive && <p className="mt-1 text-xs text-slate-500">{labels.sourceCheckedAt}<time dateTime={curve.fetchedAt}>{checkedFormat.format(new Date(curve.fetchedAt))}</time></p>}
            <a href={FORECAST_WORKBOOK_URL} className="mt-2 inline-block text-xs text-accent underline underline-offset-4">{labels.sourceOpen} · {labels.sourceBoi}</a>
          </section>
        </div>
        <p className="mt-5 text-xs leading-6 text-slate-500">{labels.refreshNote}</p>
        <form action={`/${locale}`} method="get"><button type="submit" className="glass-secondary mt-3 inline-block rounded-xl px-4 py-2.5 text-sm font-medium">{labels.refreshNow}</button></form>
      </details>
    </div>
  );
}
