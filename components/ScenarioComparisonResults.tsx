"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
// Type-only import: erased at compile time, keeps the server-only
// dictionary module out of the client bundle.
import type { Dictionary } from "@/app/[locale]/dictionaries";
import {
  buildComparisonRows,
  costInsight,
  paymentShapeInsight,
  stabilityInsight,
  type ComparisonMetricKey,
  type ScenarioForCompare,
} from "@/lib/mortgage/scenario-compare";
import CopyLinkButton from "./CopyLinkButton";

type ComparePageLabels = Dictionary["comparePage"];

interface ScenarioComparisonResultsProps {
  locale: Locale;
  labels: ComparePageLabels;
  scenarioA: ScenarioForCompare;
  scenarioB: ScenarioForCompare;
}

const CURRENCY_METRICS: ReadonlySet<ComparisonMetricKey> = new Set([
  "firstPayment",
  "maxPayment",
  "totalPayment",
  "totalInterest",
]);
const PERCENT_METRICS: ReadonlySet<ComparisonMetricKey> = new Set([
  "primeExposure",
  "cpiExposure",
  "variableExposure",
]);

export default function ScenarioComparisonResults({
  locale,
  labels,
  scenarioA,
  scenarioB,
}: ScenarioComparisonResultsProps) {
  const intlLocale = locale === "he" ? "he-IL" : "en-US";
  const currencyFormat = new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  });
  const signedCurrencyFormat = new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
    signDisplay: "exceptZero",
  });
  const percentFormat = new Intl.NumberFormat(intlLocale, {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const signedPercentFormat = new Intl.NumberFormat(intlLocale, {
    style: "percent",
    maximumFractionDigits: 0,
    signDisplay: "exceptZero",
  });
  const numberFormat = new Intl.NumberFormat(intlLocale);
  const signedNumberFormat = new Intl.NumberFormat(intlLocale, {
    signDisplay: "exceptZero",
  });

  const metricLabels: Record<ComparisonMetricKey, string> = {
    firstPayment: labels.metricFirstPayment,
    maxPayment: labels.metricMaxPayment,
    totalPayment: labels.metricTotalPayment,
    totalInterest: labels.metricTotalInterest,
    stabilityScore: labels.metricStability,
    trackCount: labels.metricTrackCount,
    primeExposure: labels.metricPrimeExposure,
    cpiExposure: labels.metricCpiExposure,
    variableExposure: labels.metricVariableExposure,
  };

  function formatValue(metric: ComparisonMetricKey, value: number): string {
    if (CURRENCY_METRICS.has(metric)) return currencyFormat.format(value);
    if (PERCENT_METRICS.has(metric)) return percentFormat.format(value / 100);
    if (metric === "stabilityScore") {
      return `${numberFormat.format(Math.round(value))}/100`;
    }
    return numberFormat.format(value);
  }

  function formatDiff(metric: ComparisonMetricKey, diff: number): string {
    if (CURRENCY_METRICS.has(metric)) return signedCurrencyFormat.format(diff);
    if (PERCENT_METRICS.has(metric)) {
      return signedPercentFormat.format(diff / 100);
    }
    if (metric === "stabilityScore") {
      return signedNumberFormat.format(Math.round(diff));
    }
    return signedNumberFormat.format(diff);
  }

  const rows = buildComparisonRows(scenarioA, scenarioB);

  // Overflow detection for the comparison table, mirroring the same
  // pattern used by the calculator's amortization schedule: a hint + edge
  // fade only appear when the table is actually wider than its container.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrollable, setIsScrollable] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const checkOverflow = () =>
      setIsScrollable(el.scrollWidth > el.clientWidth + 1);
    checkOverflow();
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [rows.length]);

  const cost = costInsight(scenarioA, scenarioB);
  const stability = stabilityInsight(scenarioA, scenarioB);
  const shape = paymentShapeInsight(scenarioA, scenarioB);

  const insightSentences: string[] = [];
  if (cost.cheaperSide !== "tie") {
    const cheaperName =
      cost.cheaperSide === "a" ? scenarioA.name : scenarioB.name;
    insightSentences.push(
      labels.cheaperSentence
        .replace("{scenario}", cheaperName)
        .replace("{amount}", currencyFormat.format(cost.diffAbs)),
    );
  }
  if (stability.moreStableSide !== "tie") {
    const name =
      stability.moreStableSide === "a" ? scenarioA.name : scenarioB.name;
    insightSentences.push(
      labels.moreStableSentence.replace("{scenario}", name),
    );
  }
  if (shape) {
    const name = shape.side === "a" ? scenarioA.name : scenarioB.name;
    insightSentences.push(
      labels.lowerFirstHigherMaxSentence.replace("{scenario}", name),
    );
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-bold tracking-tight">
          {labels.resultsTitle}
        </h2>
        <CopyLinkButton
          buttonLabel={labels.copyComparisonLinkButton}
          successText={labels.copyComparisonLinkSuccess}
          fallbackText={labels.copyComparisonLinkFallback}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[scenarioA, scenarioB].map((scenario) => (
          <div
            key={scenario.name}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="text-sm font-bold text-slate-900">
              {scenario.name}
            </div>
            <div className="mt-1 text-xl font-bold text-slate-900">
              {currencyFormat.format(scenario.summary.totalPayment)}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {labels.metricTotalPayment}
            </p>
          </div>
        ))}
      </div>

      {isScrollable && (
        <p className="mt-4 mb-2 flex items-center gap-1.5 text-xs text-slate-500">
          <span aria-hidden>↔</span>
          {labels.tableScrollHint}
        </p>
      )}

      <div className="relative mt-4">
        <div
          ref={scrollRef}
          className="max-h-[500px] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3 text-start font-medium text-slate-600"
                >
                  {" "}
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3 text-end font-medium text-slate-600"
                >
                  {scenarioA.name}
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3 text-end font-medium text-slate-600"
                >
                  {scenarioB.name}
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3 text-end font-medium text-slate-600"
                >
                  {labels.diffLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.metric}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-4 py-2.5 text-start text-slate-500">
                    {metricLabels[row.metric]}
                  </td>
                  <td className="px-4 py-2.5 text-end whitespace-nowrap text-slate-700">
                    {formatValue(row.metric, row.valueA)}
                  </td>
                  <td className="px-4 py-2.5 text-end whitespace-nowrap text-slate-700">
                    {formatValue(row.metric, row.valueB)}
                  </td>
                  <td className="px-4 py-2.5 text-end whitespace-nowrap font-medium text-slate-900">
                    {formatDiff(row.metric, row.diff)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isScrollable && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white to-transparent sm:w-8"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent sm:w-8"
            />
          </>
        )}
      </div>

      {insightSentences.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm font-bold text-slate-900">
            {labels.insightsTitle}
          </p>
          <ul className="space-y-1.5">
            {insightSentences.map((sentence) => (
              <li
                key={sentence}
                className="text-sm leading-6 text-slate-600"
              >
                {sentence}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-sm leading-6 text-slate-500">
        {labels.disclaimer}
      </p>
    </div>
  );
}
