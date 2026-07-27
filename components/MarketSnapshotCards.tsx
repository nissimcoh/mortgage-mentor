// Server Component: renders a pre-fetched market snapshot. No fetching and
// no interactivity here — data arrives as props from the page.

import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { MarketSnapshot } from "@/lib/market-data/types";

type MarketLabels = Dictionary["market"];

interface MarketSnapshotCardsProps {
  snapshot: MarketSnapshot;
  labels: MarketLabels;
  locale: Locale;
}

interface CardStatus {
  isLive: boolean;
  isStale: boolean;
}

function StatusChip({
  status,
  labels,
  verifiedAtText,
}: {
  status: CardStatus;
  labels: MarketLabels;
  verifiedAtText: string;
}) {
  const text = !status.isLive
    ? `${labels.statusFallbackPrefix}${verifiedAtText}`
    : status.isStale
      ? labels.statusStale
      : labels.statusLive;
  const tone = !status.isLive
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : status.isStale
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs ${tone}`}
    >
      {text}
    </span>
  );
}

export default function MarketSnapshotCards({
  snapshot,
  labels,
  locale,
}: MarketSnapshotCardsProps) {
  const intlLocale = locale === "he" ? "he-IL" : "en-US";

  const percentFormat = new Intl.NumberFormat(intlLocale, {
    style: "percent",
    maximumFractionDigits: 2,
  });
  const signedPercentFormat = new Intl.NumberFormat(intlLocale, {
    style: "percent",
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  });
  const numberFormat = new Intl.NumberFormat(intlLocale, {
    maximumFractionDigits: 1,
  });
  const dateFormat = new Intl.DateTimeFormat(intlLocale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const monthFormat = new Intl.DateTimeFormat(intlLocale, {
    month: "long",
    year: "numeric",
  });
  const dateTimeFormat = new Intl.DateTimeFormat(intlLocale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  });

  const formatDate = (iso: string) => dateFormat.format(new Date(iso));
  const verifiedAtText = formatDate(snapshot.fallbackVerifiedAt);
  const cpiMonthText = monthFormat.format(
    new Date(Date.UTC(snapshot.cpi.referenceYear, snapshot.cpi.referenceMonth - 1, 1)),
  );
  const quarterText = labels.quarterLabel
    .replace("{q}", String(snapshot.inflationForecast.horizonEndQuarter))
    .replace("{year}", String(snapshot.inflationForecast.horizonEndYear));

  const cards = [
    {
      label: labels.boiRateLabel,
      value: percentFormat.format(snapshot.boiRate.ratePercent / 100),
      detail: `${labels.effectiveFrom}${formatDate(snapshot.boiRate.effectiveDate)}`,
      help: labels.boiRateHelp,
      source: labels.sourceBoi,
      status: snapshot.boiRate,
    },
    {
      label: labels.primeRateLabel,
      value: percentFormat.format(snapshot.primeRate.ratePercent / 100),
      detail: `${labels.effectiveFrom}${formatDate(snapshot.boiRate.effectiveDate)}`,
      help: labels.primeRateHelp,
      source: labels.sourceDerived,
      status: { isLive: snapshot.primeRate.isLive, isStale: snapshot.boiRate.isStale },
    },
    {
      label: labels.nextDecisionLabel,
      value:
        snapshot.nextDecision.at === null
          ? labels.nextDecisionUnknown
          : dateTimeFormat.format(new Date(snapshot.nextDecision.at)),
      detail: null,
      help: labels.nextDecisionHelp,
      source: labels.sourceBoi,
      status: { isLive: snapshot.nextDecision.isLive, isStale: false },
    },
    {
      label: labels.cpiLabel,
      value: signedPercentFormat.format(snapshot.cpi.monthlyChangePercent / 100),
      detail: `${labels.asOf}${cpiMonthText} · ${labels.cpiIndexValueLabel}: ${numberFormat.format(snapshot.cpi.indexValue)}`,
      help: labels.cpiHelp,
      source: labels.sourceCbs,
      status: snapshot.cpi,
    },
  ];

  return (
    <section className="w-full">
      <h2 className="mb-1 text-lg font-semibold tracking-tight text-slate-700">
        {labels.title}
      </h2>
      <p className="mb-4 text-sm leading-6 text-slate-500">{labels.subtitle}</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="text-sm text-slate-500">{card.label}</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {card.value}
            </div>
            {card.detail && (
              <div className="mt-1 text-xs text-slate-500">{card.detail}</div>
            )}
            <p className="mt-2 flex-1 text-xs leading-5 text-slate-500">
              {card.help}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-400">
                {labels.sourceLabel}: {card.source}
              </span>
              <StatusChip
                status={card.status}
                labels={labels}
                verifiedAtText={verifiedAtText}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-medium text-slate-700">
            {labels.forecastTitle}
          </span>
          <span className="text-lg font-bold text-slate-900">
            {percentFormat.format(snapshot.inflationForecast.percent / 100)}
          </span>
          <span className="text-sm text-slate-500">
            {labels.forecastHorizonPrefix}
            {quarterText}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs leading-5 text-slate-500">{labels.forecastHelp}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">
              {labels.sourceLabel}: {labels.sourceBoi}
            </span>
            <StatusChip
              status={{
                isLive: snapshot.inflationForecast.isLive,
                isStale: false,
              }}
              labels={labels}
              verifiedAtText={verifiedAtText}
            />
          </div>
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-400">
        {labels.lastCheckedPrefix}
        {dateTimeFormat.format(new Date(snapshot.fetchedAt))}
      </p>
    </section>
  );
}
