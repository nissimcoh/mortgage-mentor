import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { MarketSnapshot } from "@/lib/market-data/types";
import type { MortgageForecastCurveSnapshot } from "@/lib/market-data/mortgage-forecast-types";
import { BOI_RATE_SERIES_URL } from "@/lib/market-data/sources/bank-of-israel";
import { CBS_CPI_URL } from "@/lib/market-data/sources/cbs";
import { FORECAST_WORKBOOK_URL } from "@/lib/market-data/sources/boi-mortgage-forecast";
import { isStale } from "@/lib/market-data/derive";

type MarketLabels = Dictionary["market"];

function StatusChip({ live, stale, fallback, labels }: {
  live: boolean; stale: boolean; fallback: string; labels: MarketLabels;
}) {
  return <span className={`inline-block rounded-full border px-2.5 py-1 text-xs ${live && !stale ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
    {!live ? fallback : stale ? labels.statusStale : labels.statusLive}
  </span>;
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

  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight">{labels.title}</h2>
      <p className="mb-6 mt-2 max-w-3xl text-sm leading-6 text-slate-600">{labels.subtitle}</p>
      {(snapshot.status !== "live" || snapshot.boiRate.isStale || snapshot.cpi.isStale) && <p role="status" className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{labels.dataWarning}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <article key={card.label} data-source-live={card.live} className="glass-panel flex flex-col p-5 sm:p-6">
            <h3 className="text-sm font-medium text-slate-600">{card.label}</h3>
            <p className="mt-3 text-4xl font-bold tracking-tight text-slate-900"><bdi>{card.value}</bdi></p>
            <p className="mt-2 text-xs text-slate-500">{card.detail}</p>
            {card.secondary && <p className="mt-1 text-xs text-slate-500">{card.secondary}</p>}
            {card.live && card.checkedAt && <p className="mt-1 text-xs text-slate-500">{labels.sourceCheckedAt}<time dateTime={card.checkedAt}>{checkedFormat.format(new Date(card.checkedAt))}</time></p>}
            <p className="mb-4 mt-4 flex-1 text-sm leading-6 text-slate-600">{card.help}</p>
            <div className="flex flex-col items-start gap-3">
              <StatusChip live={card.live} stale={card.stale} fallback={fallback} labels={labels} />
              <a href={card.url} target="_blank" rel="noreferrer" className="text-xs text-accent underline decoration-accent/30 underline-offset-4">{labels.sourceLabel}: {card.source}</a>
            </div>
          </article>
        ))}
      </div>
      <article className="glass-panel mt-4 grid gap-6 p-5 sm:p-6 md:grid-cols-[1.4fr_1fr]" data-forecast-status={curve?.status ?? "unavailable"}>
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-semibold">{labels.curveTitle}</h3>
            <StatusChip live={curve?.status === "live"} stale={curve ? (isStale(curve.publicationDate, new Date(snapshot.fetchedAt), 62) || isStale(curve.fetchedAt, new Date(snapshot.fetchedAt), 1)) : false} fallback={curve ? labels.curveFallback : labels.unavailable} labels={labels} />
          </div>
          <p className="mt-3 text-xl font-bold">{curveMonth}</p>
          {curve && <p className="mt-1 text-xs text-slate-500">{curve.averageType === "calendar" ? labels.curveCalendar : labels.curveIndex} · {labels.publicationPrefix}{formatDate(curve.publicationDate)}</p>}
          {curve && <p className="mt-1 text-xs text-slate-500">{labels.effectiveFrom}{formatDate(curve.effectiveDate)}</p>}
          {curve?.status === "live" && <p className="mt-1 text-xs text-slate-500">{labels.sourceCheckedAt}<time dateTime={curve.fetchedAt}>{checkedFormat.format(new Date(curve.fetchedAt))}</time></p>}
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">{labels.curveHelp}</p>
          <a href={FORECAST_WORKBOOK_URL} className="mt-3 inline-block text-xs text-accent underline underline-offset-4">{labels.sourceOpen} · {labels.sourceBoi}</a>
        </div>
        <div className="glass-track p-5">
          <h4 className="text-sm font-medium text-slate-600">{labels.expectedCpiTitle}</h4>
          <p className="mt-2 text-3xl font-bold"><bdi>{expectedCpi === null ? labels.unavailable : signedPercent.format(expectedCpi)}</bdi></p>
          <p className="mt-3 text-xs leading-6 text-slate-600">{labels.expectedCpiHelp}</p>
        </div>
      </article>
      <p className="mt-4 text-xs leading-6 text-slate-500">{labels.refreshNote}</p>
    </div>
  );
}
