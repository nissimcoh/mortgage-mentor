"use client";

import Link from "next/link";
import { useId, useMemo, useState, type ReactNode } from "react";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import { formatDateTimeIsrael } from "@/lib/forms/dates";
import type { Locale } from "@/lib/i18n/config";
import { comparisonWarnings, resolveComparisonSelection, type ComparisonScenario } from "@/lib/scenarios/comparison";
import { COMPARISON_LINE_STYLES } from "@/lib/scenarios/comparison-chart-data";
import ComparisonPaymentCharts from "./ComparisonPaymentCharts";

export default function SavedScenarioComparison({ scenarios, locale, labels }: {
  scenarios: ComparisonScenario[];
  locale: Locale;
  labels: Dictionary["savedComparison"];
}) {
  const id = useId();
  const [selectedIds, setSelectedIds] = useState(() => scenarios.slice(0, 2).map(item => item.id));
  const selected = useMemo(() => resolveComparisonSelection(scenarios, selectedIds), [scenarios, selectedIds]);
  const formats = useMemo(() => {
    const language = locale === "he" ? "he-IL" : "en-US";
    return {
      money: new Intl.NumberFormat(language, { style: "currency", currency: "ILS", maximumFractionDigits: 2 }),
      delta: new Intl.NumberFormat(language, { style: "currency", currency: "ILS", maximumFractionDigits: 2, signDisplay: "exceptZero" }),
      percent: new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 1 }),
    };
  }, [locale]);
  const warnings = comparisonWarnings(selected);
  const metrics: { label: string; value: (item: ComparisonScenario, index: number) => ReactNode }[] = [
    { label: labels.principal, value: item => formats.money.format(item.result.totalPrincipal) },
    { label: labels.term, value: item => `${item.years} ${labels.years}` },
    { label: labels.first, value: item => formats.money.format(item.result.firstPayment) },
    { label: labels.highest, value: item => <>{formats.money.format(item.result.highestPayment)}<span className="mt-1 block text-xs font-normal text-slate-500">{labels.highestMonth.replace("{month}", String(item.result.highestPaymentMonth))}</span></> },
    { label: labels.total, value: item => formats.money.format(item.result.forecastTotalPaid) },
    { label: labels.cost, value: item => formats.money.format(item.result.totalInterestOrFinancingCost) },
    { label: labels.difference, value: (item, index) => index === 0 ? labels.baseline : <bdi>{formats.delta.format(item.result.forecastTotalPaid - selected[0].result.forecastTotalPaid)}</bdi> },
    { label: labels.rateExposure, value: item => formats.percent.format(item.rateExposure) },
    { label: labels.cpiExposure, value: item => formats.percent.format(item.cpiExposure) },
    { label: labels.fixedShare, value: item => formats.percent.format(item.fixedShare) },
    { label: labels.calculated, value: item => formatDateTimeIsrael(item.calculatedAt, locale) },
  ];

  return (
    <div className="mt-6">
      <div className="glass-panel grid gap-4 p-4 sm:grid-cols-3">
        {selected.map((scenario, index) => (
          <div key={index}>
            <label htmlFor={`${id}-${index}`} className="mb-2 block text-sm font-medium">{labels.choose} {index + 1}</label>
            <select id={`${id}-${index}`} value={scenario.id}
              onChange={event => setSelectedIds(current => current.map((value, slot) => slot === index ? event.target.value : value))}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
              {scenarios.map(option => <option key={option.id} value={option.id} disabled={selectedIds.includes(option.id) && option.id !== scenario.id}>{option.name}</option>)}
            </select>
          </div>
        ))}
        {scenarios.length > 2 && (
          <button type="button" className="min-h-11 self-end rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium"
            onClick={() => setSelectedIds(current => current.length === 3 ? current.slice(0, 2) : [...current, scenarios.find(item => !current.includes(item.id))!.id])}>
            {selected.length === 3 ? labels.remove : labels.add}
          </button>
        )}
      </div>
      <p className="mt-5 text-sm leading-7 text-slate-600">{labels.snapshotNote}</p>
      <div aria-live="polite" className="mt-3 space-y-2">
        {(Object.keys(warnings) as (keyof typeof warnings)[]).filter(key => warnings[key]).map(key => (
          <p key={key} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{labels[key]}</p>
        ))}
      </div>
      <ComparisonPaymentCharts scenarios={selected} locale={locale} labels={labels} />
      <p id={`${id}-scroll`} className="mt-4 text-xs text-slate-500">{labels.scrollHint}</p>
      <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white" role="region" aria-label={labels.title} tabIndex={0}>
        <table className="w-full min-w-[640px] text-sm" aria-describedby={`${id}-scroll ${id}-exposure`}>
          <caption className="sr-only">{labels.title}</caption>
          <thead className="bg-slate-50 text-start">
            <tr><th scope="col" className="sticky start-0 z-10 min-w-36 bg-slate-50 p-4 text-start">{labels.metric}</th>
              {selected.map((item, index) => <th scope="col" key={item.id} className="min-w-44 max-w-64 p-4 text-start"><Link className="break-words underline underline-offset-4" style={{ color: COMPARISON_LINE_STYLES[index].color }} href={`/${locale}/saved/${item.id}`}>{index + 1}. {item.name}</Link></th>)}
            </tr>
          </thead>
          <tbody>{metrics.map(metric => <tr key={metric.label} className="border-t border-slate-100">
            <th scope="row" className="sticky start-0 z-10 bg-white p-4 text-start font-medium text-slate-600">{metric.label}</th>
            {selected.map((item, index) => <td key={item.id} className="p-4 text-start font-semibold tabular-nums">{metric.value(item, index)}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
      <p id={`${id}-exposure`} className="mt-4 text-xs leading-6 text-slate-500">{labels.exposureHelp}</p>
    </div>
  );
}
