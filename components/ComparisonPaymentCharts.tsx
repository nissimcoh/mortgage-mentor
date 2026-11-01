"use client";

import Link from "next/link";
import { useId, useMemo, useState, type PointerEvent } from "react";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import type { ComparisonScenario } from "@/lib/scenarios/comparison";
import { COMPARISON_LINE_STYLES, comparisonMonthValues, cumulativePayments } from "@/lib/scenarios/comparison-chart-data";

const WIDTH = 480, HEIGHT = 260, LEFT = 64, RIGHT = 464, TOP = 16, BOTTOM = 218;

export default function ComparisonPaymentCharts({ scenarios, locale, labels }: {
  scenarios: ComparisonScenario[];
  locale: Locale;
  labels: Dictionary["savedComparison"];
}) {
  const id = useId();
  const [chosenMonth, setChosenMonth] = useState(1);
  const series = useMemo(() => scenarios.map((scenario, index) => ({
    scenario, style: COMPARISON_LINE_STYLES[index],
    cumulative: scenario.payments ? cumulativePayments(scenario.payments) : null,
  })), [scenarios]);
  const available = series.filter(item => item.scenario.payments && item.cumulative);
  // Keep the same time axis even if a selected mix's historical chart is unavailable.
  const maxMonth = Math.max(1, ...scenarios.map(item => Math.round(item.years * 12)));
  const month = Math.min(chosenMonth, maxMonth);
  const formats = useMemo(() => {
    const language = locale === "he" ? "he-IL" : "en-US";
    return {
      money: new Intl.NumberFormat(language, { style: "currency", currency: "ILS", maximumFractionDigits: 2 }),
      compact: new Intl.NumberFormat(language, { notation: "compact", maximumFractionDigits: 1 }),
      signedCompact: new Intl.NumberFormat(language, { notation: "compact", maximumFractionDigits: 1, signDisplay: "exceptZero" }),
      delta: new Intl.NumberFormat(language, { style: "currency", currency: "ILS", maximumFractionDigits: 0, signDisplay: "exceptZero" }),
      years: new Intl.NumberFormat(language, { maximumFractionDigits: 1 }),
    };
  }, [locale]);
  const x = (value: number) => LEFT + value / maxMonth * (RIGHT - LEFT);
  // Static per chart: axis maximum and full polylines depend on the selected
  // mixes only, so moving the month slider re-renders just the markers.
  const plots = useMemo(() => {
    const plotX = (value: number) => LEFT + value / maxMonth * (RIGHT - LEFT);
    const withData = series.filter(item => item.scenario.payments && item.cumulative);
    return Object.fromEntries((["monthly", "cumulative"] as const).map(kind => {
      const maximum = Math.max(1, ...withData.flatMap(item => kind === "monthly" ? item.scenario.payments! : [item.cumulative!.at(-1)!]));
      const y = (value: number) => BOTTOM - value / maximum * (BOTTOM - TOP);
      const start = kind === "monthly" ? 1 : 0;
      const lines = withData.map(item => Array.from({ length: maxMonth - start + 1 }, (_, i) => {
        const values = comparisonMonthValues(item.scenario.payments!, item.cumulative!, i + start);
        return `${plotX(i + start)},${y(kind === "monthly" ? values.payment : values.cumulative)}`;
      }).join(" "));
      return [kind, { maximum, y, lines }];
    })) as Record<"monthly" | "cumulative", { maximum: number; y: (value: number) => number; lines: string[] }>;
  }, [series, maxMonth]);
  // Cumulative paid minus mix 1, per month: positive means "paid more than mix 1 so far".
  const difference = useMemo(() => {
    const [baseline, ...others] = series;
    if (!baseline?.scenario.payments || !baseline.cumulative) return null;
    const rows = others.filter(item => item.scenario.payments && item.cumulative).map(item => ({
      item,
      values: Array.from({ length: maxMonth + 1 }, (_, m) =>
        comparisonMonthValues(item.scenario.payments!, item.cumulative!, m).cumulative -
        comparisonMonthValues(baseline.scenario.payments!, baseline.cumulative!, m).cumulative),
    }));
    if (rows.length === 0) return null;
    const low = Math.min(0, ...rows.flatMap(row => row.values));
    const high = Math.max(0, ...rows.flatMap(row => row.values));
    const span = high - low || 1;
    const y = (value: number) => BOTTOM - (value - low) / span * (BOTTOM - TOP);
    const plotX = (value: number) => LEFT + value / maxMonth * (RIGHT - LEFT);
    return {
      low, high, y,
      rows: rows.map(row => ({ ...row, path: row.values.map((value, m) => `${m === 0 ? "M" : "L"}${plotX(m)},${y(value)}`).join("") })),
    };
  }, [series, maxMonth]);
  const choosePoint = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    const plotX = (event.clientX - bounds.left) / bounds.width * WIDTH;
    setChosenMonth(Math.max(1, Math.min(maxMonth, Math.round((plotX - LEFT) / (RIGHT - LEFT) * maxMonth))));
  };
  const selectedText = `${labels.chartMonth} ${month} · ${labels.chartYear} ${formats.years.format(month / 12)}`;
  const valueText = available.map(item => {
    const values = comparisonMonthValues(item.scenario.payments!, item.cumulative!, month);
    return `${item.scenario.name}: ${labels.monthlyChartTitle} ${formats.money.format(values.payment)}, ${labels.cumulativeChartTitle} ${formats.money.format(values.cumulative)}`;
  }).join("; ");

  return (
    <section aria-labelledby={`${id}-title`} className="mt-6">
      <h2 id={`${id}-title`} className="text-xl font-bold">{labels.chartsTitle}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{labels.chartsHelp}</p>
      {series.filter(item => !item.scenario.payments).map(item => (
        <p key={item.scenario.id} role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          <Link href={`/${locale}/saved/${item.scenario.id}`} className="font-semibold underline underline-offset-4">{item.scenario.name}</Link>: {labels.chartUnavailable}
        </p>
      ))}
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label={labels.chartLegend}>
        {series.map((item, index) => <span key={item.scenario.id} className="flex min-w-0 items-center gap-2">
          <svg width="30" height="12" aria-hidden="true" className="shrink-0"><line x1="0" x2="30" y1="6" y2="6" stroke={item.style.color} strokeWidth="3" strokeDasharray={item.style.dash} /></svg>
          <span className="min-w-0 break-words">{index + 1}. {item.scenario.name}</span>
        </span>)}
      </div>
      {available.length > 0 && <div className="glass-panel mt-4 px-4 py-3">
        <label htmlFor={`${id}-month`} className="block text-sm font-medium">{labels.chartChooseMonth}: <bdi>{selectedText}</bdi></label>
        <div dir="ltr" className="mt-2">
          <input id={`${id}-month`} type="range" min="1" max={maxMonth} step="1" value={month}
            onChange={event => setChosenMonth(Number(event.target.value))} aria-valuetext={`${selectedText}; ${valueText}`}
            className="h-11 w-full cursor-pointer accent-accent" />
          <div className="flex justify-between text-xs text-slate-500"><span>{labels.chartMonth} 1</span><span>{labels.chartMonth} {maxMonth}</span></div>
        </div>
      </div>}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {(["monthly", "cumulative"] as const).map(kind => {
          const title = kind === "monthly" ? labels.monthlyChartTitle : labels.cumulativeChartTitle;
          const { maximum, y, lines } = plots[kind];
          return <section key={kind} aria-labelledby={`${id}-${kind}`} className="glass-panel min-w-0 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id={`${id}-${kind}`} className="text-base font-semibold">{title}</h3>
              {available.length > 0 && <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{labels.chartMonth} {month}</span>}
            </div>
            <p className="mt-1 text-xs leading-6 text-slate-500">{kind === "monthly" ? labels.monthlyChartHelp : labels.cumulativeChartHelp}</p>
            {available.length > 0 && <div dir="ltr" className="mt-3">
              {/* Keeps the viewBox aspect ratio: a stretched ("none") SVG
                  distorts the axis labels on wide screens. */}
              <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true"
                className="h-auto w-full touch-pan-y" onPointerDown={choosePoint} onPointerMove={event => {
                  if (event.pointerType === "mouse" || event.buttons === 1) choosePoint(event);
                }}>
                {[0, .5, 1].map(fraction => <g key={fraction}>
                  <line x1={LEFT} x2={RIGHT} y1={y(maximum * fraction)} y2={y(maximum * fraction)} stroke="#e2e8f0" strokeWidth="1" />
                  <text x={LEFT - 8} y={y(maximum * fraction) + 4} textAnchor="end" fill="#475569" fontSize="16">{formats.compact.format(maximum * fraction)}</text>
                </g>)}
                {[0, .25, .5, .75, 1].map(fraction => <text key={fraction} x={x(maxMonth * fraction)} y="245" textAnchor={fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"} fill="#475569" fontSize="16">{formats.years.format(maxMonth * fraction / 12)}</text>)}
                {available.map((item, line) => {
                  const points = lines[line];
                  const values = comparisonMonthValues(item.scenario.payments!, item.cumulative!, month);
                  return <g key={item.scenario.id}>
                    <polyline points={points} fill="none" stroke={item.style.color} strokeDasharray={item.style.dash} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" className="mm-wipe" />
                    <circle cx={x(month)} cy={y(kind === "monthly" ? values.payment : values.cumulative)} r="4" fill={item.style.color} stroke="white" strokeWidth="2" />
                  </g>;
                })}
                <line x1={x(month)} x2={x(month)} y1={TOP} y2={BOTTOM} stroke="#94a3b8" strokeWidth="1" />
              </svg>
              <p className="text-center text-xs text-slate-500">{labels.chartAxis}</p>
            </div>}
            <dl className="mt-4 space-y-3">
              {series.map((item, index) => {
                const values = item.scenario.payments ? comparisonMonthValues(item.scenario.payments, item.cumulative!, month) : null;
                return <div key={item.scenario.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-slate-200 pt-3 text-sm">
                  <dt className="min-w-0 break-words">{index + 1}. {item.scenario.name}</dt>
                  <dd className="flex items-center gap-2 font-semibold tabular-nums"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: item.style.color }} /><bdi>{values ? formats.money.format(kind === "monthly" ? values.payment : values.cumulative) : labels.chartNoData}</bdi></dd>
                </div>;
              })}
            </dl>
          </section>;
        })}
        {difference && <section aria-labelledby={`${id}-difference`} className="glass-panel min-w-0 p-4 sm:p-5 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id={`${id}-difference`} className="text-base font-semibold">{labels.differenceChartTitle}</h3>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{labels.chartMonth} {month}</span>
          </div>
          <p className="mt-1 text-xs leading-6 text-slate-500">{labels.differenceChartHelp}</p>
          <div className="xl:grid xl:grid-cols-[3fr_2fr] xl:items-center xl:gap-8">
          <div dir="ltr" className="mt-3">
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true" overflow="visible" className="h-auto w-full touch-pan-y"
              onPointerDown={choosePoint} onPointerMove={event => {
                if (event.pointerType === "mouse" || event.buttons === 1) choosePoint(event);
              }}>
              {[difference.low, difference.high].filter(value => value !== 0).map(value => <g key={value}>
                <line x1={LEFT} x2={RIGHT} y1={difference.y(value)} y2={difference.y(value)} stroke="#e2e8f0" strokeWidth="1" />
                <text x={LEFT - 8} y={difference.y(value) + 4} textAnchor="end" fill="#475569" fontSize="16">{formats.signedCompact.format(value)}</text>
              </g>)}
              <line x1={LEFT} x2={RIGHT} y1={difference.y(0)} y2={difference.y(0)} stroke={COMPARISON_LINE_STYLES[0].color} strokeWidth="1.5" />
              <text x={LEFT - 8} y={difference.y(0) + 4} textAnchor="end" fill="#475569" fontSize="16">0</text>
              {[0, .25, .5, .75, 1].map(fraction => <text key={fraction} x={x(maxMonth * fraction)} y="245" textAnchor={fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"} fill="#475569" fontSize="16">{formats.years.format(maxMonth * fraction / 12)}</text>)}
              {difference.rows.map(row => <g key={row.item.scenario.id}>
                <path d={row.path} fill="none" stroke={row.item.style.color} strokeDasharray={row.item.style.dash} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" className="mm-wipe" />
                <circle cx={x(month)} cy={difference.y(row.values[month])} r="4.5" fill={row.item.style.color} stroke="white" strokeWidth="2" />
              </g>)}
              <line x1={x(month)} x2={x(month)} y1={TOP} y2={BOTTOM} stroke="#94a3b8" strokeWidth="1" />
            </svg>
            <p className="text-center text-xs text-slate-500">{labels.chartAxis}</p>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {difference.rows.map(row => (
              <div key={row.item.scenario.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-slate-200 pt-3 text-sm">
                <dt className="min-w-0 break-words">{series.indexOf(row.item) + 1}. {row.item.scenario.name}</dt>
                <dd className="flex items-center gap-2 font-semibold tabular-nums"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: row.item.style.color }} /><bdi>{formats.delta.format(row.values[month])}</bdi></dd>
              </div>
            ))}
          </dl>
          </div>
        </section>}
      </div>
    </section>
  );
}
