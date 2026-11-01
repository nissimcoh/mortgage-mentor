"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import { formatDateTimeIsrael } from "@/lib/forms/dates";
import type { Locale } from "@/lib/i18n/config";
import { comparisonWarnings, resolveComparisonSelection, type ComparisonScenario } from "@/lib/scenarios/comparison";
import { loadComparisonPayments } from "@/lib/scenarios/comparison-actions";
import { COMPARISON_LINE_STYLES } from "@/lib/scenarios/comparison-chart-data";
import { comparisonHighlights, cumulativeCrossoverMonth, type ComparisonHighlight } from "@/lib/scenarios/comparison-insights";
import ComparisonPaymentCharts from "./ComparisonPaymentCharts";

type Labels = Dictionary["savedComparison"];

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));

function MixDot({ index }: { index: number }) {
  return <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COMPARISON_LINE_STYLES[index].color }} />;
}

/** Plain-language observations, each derived directly from the saved figures. */
function buildInsights(selected: ComparisonScenario[], labels: Labels, money: Intl.NumberFormat) {
  const highlights = comparisonHighlights(selected);
  const byId = (id: string | null) => selected.find(item => item.id === id);
  const cheapest = byId(highlights.lowestTotal);
  const lowestFirst = byId(highlights.lowestFirst);
  const insights: string[] = [];
  if (cheapest) {
    const priciest = selected.reduce((max, item) => item.result.forecastTotalPaid > max.result.forecastTotalPaid ? item : max);
    insights.push(fill(labels.insightCheapest, { name: cheapest.name, other: priciest.name, amount: money.format(priciest.result.forecastTotalPaid - cheapest.result.forecastTotalPaid) }));
  }
  if (cheapest && lowestFirst && lowestFirst.id !== cheapest.id) {
    insights.push(fill(labels.insightTradeoff, {
      first: lowestFirst.name, cheapest: cheapest.name,
      firstGap: money.format(cheapest.result.firstPayment - lowestFirst.result.firstPayment),
      totalGap: money.format(lowestFirst.result.forecastTotalPaid - cheapest.result.forecastTotalPaid),
    }));
    const crossover = cumulativeCrossoverMonth(lowestFirst.payments ?? null, cheapest.payments ?? null);
    if (crossover) insights.push(fill(labels.insightCrossover, { year: Math.ceil(crossover / 12), first: lowestFirst.name, cheapest: cheapest.name }));
  }
  const peakValues = selected.map(item => item.result.highestPayment);
  const peak = selected.filter(item => item.result.highestPayment === Math.max(...peakValues));
  if (peak.length === 1) insights.push(fill(labels.insightPeak, { name: peak[0].name, amount: money.format(peak[0].result.highestPayment), month: peak[0].result.highestPaymentMonth }));
  return { highlights, insights, cheapest };
}

export default function SavedScenarioComparison({ scenarios, locale, labels }: {
  scenarios: ComparisonScenario[];
  locale: Locale;
  labels: Labels;
}) {
  const id = useId();
  const [selectedIds, setSelectedIds] = useState(() => scenarios.slice(0, 2).map(item => item.id));
  // The server sends payment series only for the initial selection; others
  // are fetched once, the first time they are selected.
  const [fetched, setFetched] = useState<Record<string, number[] | null>>({});
  const requested = useRef(new Set<string>());
  const known = useMemo(() => scenarios.map(item =>
    item.payments === undefined && item.id in fetched ? { ...item, payments: fetched[item.id] } : item), [scenarios, fetched]);
  const selected = useMemo(() => resolveComparisonSelection(known, selectedIds), [known, selectedIds]);
  const chartsLoading = selected.some(item => item.payments === undefined);
  useEffect(() => {
    const missing = selected.filter(item => item.payments === undefined && !requested.current.has(item.id)).map(item => item.id);
    if (!missing.length) return;
    missing.forEach(id => requested.current.add(id));
    // A failed request shows the same "unavailable" note as an unverifiable mix.
    loadComparisonPayments(missing).catch(() => null).then(result =>
      setFetched(current => ({ ...current, ...Object.fromEntries(missing.map(id => [id, result?.[id] ?? null])) })));
  }, [selected]);
  const formats = useMemo(() => {
    const language = locale === "he" ? "he-IL" : "en-US";
    return {
      money: new Intl.NumberFormat(language, { style: "currency", currency: "ILS", maximumFractionDigits: 2 }),
      whole: new Intl.NumberFormat(language, { style: "currency", currency: "ILS", maximumFractionDigits: 0 }),
      delta: new Intl.NumberFormat(language, { style: "currency", currency: "ILS", maximumFractionDigits: 2, signDisplay: "exceptZero" }),
      percent: new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 1 }),
    };
  }, [locale]);
  const warnings = comparisonWarnings(selected);
  const notes = (Object.keys(warnings) as (keyof typeof warnings)[]).filter(key => warnings[key]);
  const withoutChart = chartsLoading ? [] : selected.filter(item => item.payments === null);
  const { highlights, insights, cheapest } = buildInsights(selected, labels, formats.whole);
  const badgesFor = (item: ComparisonScenario) =>
    (Object.keys(highlights) as ComparisonHighlight[]).filter(key => highlights[key] === item.id);

  // `amount` feeds the in-cell bar; `best` marks the row's leader with a check.
  const metrics: { label: string; value: (item: ComparisonScenario, index: number) => ReactNode; amount?: (item: ComparisonScenario) => number; best?: ComparisonHighlight }[] = [
    { label: labels.principal, value: item => formats.money.format(item.result.totalPrincipal) },
    { label: labels.term, value: item => `${item.years} ${labels.years}` },
    { label: labels.first, value: item => formats.money.format(item.result.firstPayment), amount: item => item.result.firstPayment, best: "lowestFirst" },
    { label: labels.highest, value: item => <>{formats.money.format(item.result.highestPayment)}<span className="mt-1 block text-xs font-normal text-slate-500">{labels.highestMonth.replace("{month}", String(item.result.highestPaymentMonth))}</span></>, amount: item => item.result.highestPayment, best: "lowestPeak" },
    { label: labels.total, value: item => formats.money.format(item.result.forecastTotalPaid), amount: item => item.result.forecastTotalPaid, best: "lowestTotal" },
    { label: labels.cost, value: item => formats.money.format(item.result.totalInterestOrFinancingCost), amount: item => item.result.totalInterestOrFinancingCost },
    { label: labels.difference, value: (item, index) => index === 0 ? labels.baseline : <bdi>{formats.delta.format(item.result.forecastTotalPaid - selected[0].result.forecastTotalPaid)}</bdi> },
    { label: labels.rateExposure, value: item => formats.percent.format(item.rateExposure), amount: item => item.rateExposure },
    { label: labels.cpiExposure, value: item => formats.percent.format(item.cpiExposure), amount: item => item.cpiExposure },
    { label: labels.fixedShare, value: item => formats.percent.format(item.fixedShare), amount: item => item.fixedShare, best: "mostFixed" },
    { label: labels.calculated, value: item => formatDateTimeIsrael(item.calculatedAt, locale) },
  ];

  return (
    <div className="mt-6">
      <div className="glass-panel grid gap-4 p-4 sm:grid-cols-3">
        {selected.map((scenario, index) => (
          <div key={index}>
            <label htmlFor={`${id}-${index}`} className="mb-2 flex items-center gap-2 text-sm font-medium"><MixDot index={index} />{labels.choose} {index + 1}</label>
            <select id={`${id}-${index}`} value={scenario.id}
              onChange={event => setSelectedIds(current => current.map((value, slot) => slot === index ? event.target.value : value))}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
              {scenarios.map(option => <option key={option.id} value={option.id} disabled={selectedIds.includes(option.id) && option.id !== scenario.id}>{option.name}</option>)}
            </select>
          </div>
        ))}
        {scenarios.length > 2 && (
          <button type="button" className="glass-secondary min-h-11 self-end rounded-xl px-4 py-2 text-sm font-medium"
            onClick={() => setSelectedIds(current => current.length === 3 ? current.slice(0, 2) : [...current, scenarios.find(item => !current.includes(item.id))!.id])}>
            {selected.length === 3 ? labels.remove : labels.add}
          </button>
        )}
      </div>
      <p className="mt-5 text-sm leading-7 text-slate-600">{labels.snapshotNote}</p>

      <section aria-labelledby={`${id}-verdict`} className="mt-8">
        <h2 id={`${id}-verdict`} className="text-xl font-bold">{labels.verdictTitle}</h2>
        <div className={`mt-4 grid gap-4 ${selected.length === 3 ? "lg:grid-cols-3" : "sm:grid-cols-2"}`}>
          {selected.map((item, index) => {
            const badges = badgesFor(item);
            return (
              <article key={item.id} className="glass-panel mm-card-in relative overflow-hidden p-5" style={{ animationDelay: `${index * 0.08}s` }}>
                <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: COMPARISON_LINE_STYLES[index].color }} />
                <h3 className="flex items-center gap-2 font-semibold">
                  <MixDot index={index} />
                  <Link href={`/${locale}/saved/${item.id}`} className="min-w-0 break-words underline decoration-slate-300 underline-offset-4">{index + 1}. {item.name}</Link>
                </h3>
                <p className="mt-4 text-xs text-slate-500">{labels.first}</p>
                <p className="mt-1 text-3xl font-bold tracking-tight">{formats.money.format(item.result.firstPayment)}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-900/10 pt-3 text-sm">
                  <div><dt className="text-xs text-slate-500">{labels.highest}</dt><dd className="mt-0.5 font-semibold tabular-nums">{formats.whole.format(item.result.highestPayment)}</dd></div>
                  <div><dt className="text-xs text-slate-500">{labels.total}</dt><dd className="mt-0.5 font-semibold tabular-nums">{formats.whole.format(item.result.forecastTotalPaid)}</dd></div>
                </dl>
                {cheapest && cheapest.id !== item.id && (
                  <p className="mt-3 text-xs text-slate-500">{fill(labels.moreThanCheapest, { amount: formats.whole.format(item.result.forecastTotalPaid - cheapest.result.forecastTotalPaid) })}</p>
                )}
                {badges.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-1.5">
                    {badges.map(badge => (
                      <li key={badge} className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge === "lowestTotal" ? "bg-accent text-white" : "bg-accent-soft text-accent"}`}>
                        {badge === "lowestTotal" ? labels.cheapestTag : labels[badge]}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
        {insights.length > 0 && (
          <div className="glass-track mt-4 p-5">
            <h3 className="text-sm font-semibold text-slate-800">{labels.insightsTitle}</h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
              {insights.map(text => <li key={text} className="flex gap-2"><span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{text}</li>)}
            </ul>
            <p className="mt-3 text-xs text-slate-500">{labels.insightsNote}</p>
          </div>
        )}
      </section>

      {chartsLoading ? (
        <section aria-busy="true" className="mt-6">
          <h2 className="text-xl font-bold">{labels.chartsTitle}</h2>
          <p role="status" className="mt-2 text-sm leading-6 text-slate-600">{labels.chartsLoading}</p>
          <div aria-hidden="true" className="glass-panel mt-4 h-72 animate-pulse" />
        </section>
      ) : withoutChart.length < selected.length && <ComparisonPaymentCharts scenarios={selected} locale={locale} labels={labels} />}
      <p id={`${id}-scroll`} className="mt-6 text-xs text-slate-500">{labels.scrollHint}</p>
      <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white" role="region" aria-label={labels.title} tabIndex={0}>
        <table className="w-full min-w-[640px] text-sm" aria-describedby={`${id}-scroll ${id}-exposure`}>
          <caption className="sr-only">{labels.title}</caption>
          <thead className="bg-slate-50 text-start">
            <tr><th scope="col" className="sticky start-0 z-10 min-w-36 bg-slate-50 p-4 text-start">{labels.metric}</th>
              {selected.map((item, index) => <th scope="col" key={item.id} className="min-w-44 max-w-64 p-4 text-start"><span className="flex items-center gap-2"><MixDot index={index} /><Link className="break-words underline decoration-slate-300 underline-offset-4" href={`/${locale}/saved/${item.id}`}>{index + 1}. {item.name}</Link></span></th>)}
            </tr>
          </thead>
          <tbody>{metrics.map(metric => {
            const rowMax = metric.amount ? Math.max(...selected.map(metric.amount)) : 0;
            return <tr key={metric.label} className="border-t border-slate-100 transition-colors hover:bg-slate-50/60">
              <th scope="row" className="sticky start-0 z-10 bg-white p-4 text-start font-medium text-slate-600">{metric.label}</th>
              {selected.map((item, index) => {
                const leads = metric.best && highlights[metric.best] === item.id;
                return <td key={item.id} className="p-4 text-start font-semibold tabular-nums">
                  <span className="flex items-baseline gap-1.5">{metric.value(item, index)}{leads && <span className="text-accent" aria-label={labels[metric.best!]}>✓</span>}</span>
                  {metric.amount && rowMax > 0 && (
                    <span aria-hidden="true" className="mt-2 block h-1.5 rounded-full bg-slate-100">
                      <span className="mm-grow-x block h-full rounded-full ltr:origin-left rtl:origin-right" style={{ width: `${(metric.amount(item) / rowMax) * 100}%`, backgroundColor: COMPARISON_LINE_STYLES[index].color }} />
                    </span>
                  )}
                </td>;
              })}
            </tr>;
          })}</tbody>
        </table>
      </div>
      <p id={`${id}-exposure`} className="mt-4 text-xs leading-6 text-slate-500">{labels.exposureHelp}</p>

      {/* Caveats close the page: they qualify the results, they are not the results. */}
      {(notes.length > 0 || withoutChart.length > 0) && <section aria-labelledby={`${id}-notes`} className="mt-8 border-t border-slate-900/10 pt-5">
        <h2 id={`${id}-notes`} className="text-sm font-semibold text-slate-700">{labels.notesTitle}</h2>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
          {notes.map(key => <li key={key} className="flex gap-2"><span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />{labels[key]}</li>)}
          {withoutChart.length > 0 && <li className="flex gap-2">
            <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            <span>
              {labels.chartsMissingLead}{" "}
              {withoutChart.map((item, index) => <span key={item.id}>{index > 0 && ", "}<Link href={`/${locale}/saved/${item.id}`} className="font-medium underline decoration-slate-300 underline-offset-4">{item.name}</Link></span>)}.{" "}
              {labels.chartUnavailable}
            </span>
          </li>}
        </ul>
      </section>}
    </div>
  );
}
