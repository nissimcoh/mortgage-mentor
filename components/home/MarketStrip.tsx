import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { MarketSnapshot } from "@/lib/market-data/types";
import type { MortgageForecastCurveSnapshot } from "@/lib/market-data/mortgage-forecast-types";
import { isStale } from "@/lib/market-data/derive";
import { revealDelay } from "@/lib/ui/reveal-delay";

/** Shared frame, so the strip and its placeholder take the same space. */
const FRAME = "mx-auto mt-8 max-w-3xl sm:mt-10";
const TILES = "grid grid-cols-2 gap-y-4 rounded-3xl bg-background px-2 py-4 sm:grid-cols-4 sm:gap-y-0 sm:py-5";

/** Holds the strip's place while the official sources load. */
export function MarketStripSkeleton() {
  return (
    <div aria-hidden="true" className={FRAME}>
      <div className={`${TILES} min-h-[8.75rem] sm:min-h-[5.5rem]`} />
      <p className="mt-3 text-xs leading-5">&nbsp;</p>
    </div>
  );
}

/**
 * The four headline figures, small, directly under the hero. The full cards
 * with sources and dates stay further down the page, in #market; this reads
 * the same snapshot, so the two can never disagree.
 */
export default function MarketStrip({ snapshot, curve, labels, home, locale }: {
  snapshot: MarketSnapshot;
  curve?: MortgageForecastCurveSnapshot;
  labels: Dictionary["market"];
  home: Dictionary["home"];
  locale: Locale;
}) {
  const intlLocale = locale === "he" ? "he-IL" : "en-US";
  const percent = new Intl.NumberFormat(intlLocale, { style: "percent", maximumFractionDigits: 2 });
  const signedPercent = new Intl.NumberFormat(intlLocale, { style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero" });
  const cpiMonth = new Intl.DateTimeFormat(intlLocale, { month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(snapshot.cpi.referenceYear, snapshot.cpi.referenceMonth - 1, 1)));
  const cpiStart = curve?.expectedCpiIndex[0];
  const cpiEnd = curve?.expectedCpiIndex[12];
  const expectedCpi = cpiStart && cpiEnd && Number.isFinite(cpiEnd / cpiStart) ? cpiEnd / cpiStart - 1 : null;
  const now = new Date(snapshot.fetchedAt);
  const curveCurrent = curve?.status === "live" && !isStale(curve.publicationDate, now, 62) && !isStale(curve.fetchedAt, now, 1);
  const current = snapshot.status === "live" && !snapshot.boiRate.isStale && !snapshot.cpi.isStale && (expectedCpi === null || curveCurrent);

  const items = [
    { label: labels.boiRateLabel, value: percent.format(snapshot.boiRate.ratePercent / 100) },
    { label: labels.primeRateLabel, value: percent.format(snapshot.primeRate.ratePercent / 100) },
    { label: home.stripCpi.replace("{month}", cpiMonth), value: signedPercent.format(snapshot.cpi.monthlyChangePercent / 100) },
    ...(expectedCpi === null ? [] : [{ label: home.stripExpected, value: signedPercent.format(expectedCpi) }]),
  ];

  return (
    <div className={`mm-reveal ${FRAME}`} style={revealDelay(0.25)}>
      <dl aria-label={labels.title} className={TILES}>
        {items.map((item) => (
          <div key={item.label} className="px-3 text-center sm:border-s sm:border-black/[.07] sm:first:border-s-0">
            <dt className="text-xs leading-5 text-slate-500">{item.label}</dt>
            <dd className="mt-0.5 text-xl font-semibold tracking-tight tabular-nums text-slate-900 sm:text-2xl"><bdi>{item.value}</bdi></dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        {!current && <span className="font-medium text-amber-800">{home.stripCheck} · </span>}
        {home.stripSource}{" "}
        <a href="#market" className="font-medium text-accent hover:underline hover:underline-offset-4">{home.stripMore}</a>
      </p>
    </div>
  );
}
