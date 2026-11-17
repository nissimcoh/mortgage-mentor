"use client";

import { useMemo, useState } from "react";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import {
  fillTemplate,
  formatMoney,
  simulateExistingMortgage,
  type ExistingForecastMode,
  type ExistingMortgageMarket,
  type PayoffLoan,
} from "@/lib/payoff-report";

type Labels = Dictionary["payoffPage"];

/** A computed first payment this far off the report's suggests a misread. */
const PAYMENT_MISMATCH_RATIO = 0.01;

function formatMonth(month: string | null): string {
  if (month === null) return "";
  const [year, number] = month.split("-");
  return `${number}/${year}`;
}

/**
 * The confirmed loans simulated from today on: headline figures for the
 * whole mortgage and a line per track. Charts come next.
 */
export default function ExistingMortgageForecast({
  loans,
  market,
  labels,
  locale,
}: {
  loans: PayoffLoan[];
  market: ExistingMortgageMarket;
  labels: Labels;
  locale: Locale;
}) {
  const [mode, setMode] = useState<ExistingForecastMode>("official");
  const simulation = useMemo(() => simulateExistingMortgage(loans, market, mode), [loans, market, mode]);
  const { totals } = simulation;
  const money = (value: number) => formatMoney(value, locale);

  const stats: [string, string, string | null][] = [
    [labels.forecastNextPayment, money(totals.firstMonthPayment), null],
    [
      labels.forecastMaxPayment,
      money(totals.maximumPayment),
      fillTemplate(labels.forecastMaxPaymentWhen, { month: formatMonth(totals.maximumMonth) }),
    ],
    [labels.forecastTotalPayment, money(totals.totalPayment), null],
    [labels.forecastTotalCost, money(totals.totalCost), null],
    [labels.forecastEnds, formatMonth(totals.lastMonth), null],
  ];
  const assumptions = [...new Set(simulation.tracks.flatMap((track) => track.assumptions))];

  return (
    <section aria-labelledby="existing-forecast-heading" className="glass-panel px-5 py-6 sm:px-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 id="existing-forecast-heading" className="text-xl font-semibold tracking-tight">
          {labels.forecastHeading}
        </h2>
        <div role="group" className="inline-flex rounded-full bg-black/5 p-1 text-sm">
          {(["official", "constant"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => setMode(option)}
              className={`min-h-9 rounded-full px-4 transition-colors ${
                mode === option ? "bg-white font-medium shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {option === "official" ? labels.forecastModeOfficial : labels.forecastModeConstant}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-5 text-sm leading-6 text-slate-500">{labels.forecastIntro}</p>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {stats.map(([label, value, note]) => (
          <div key={label}>
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums tracking-tight" dir="ltr">{value}</dd>
            {note && <dd className="text-xs text-slate-500">{note}</dd>}
          </div>
        ))}
      </dl>

      <h3 className="mt-6 mb-2 text-sm font-semibold">{labels.forecastTracksHeading}</h3>
      <ul className="space-y-2 text-sm">
        {simulation.tracks.map((track) => {
          const computed = track.schedule[0].payment;
          const reported = track.reportedMonthlyPayment;
          // Compare only where the report's payment is like for like: CPI-linked
          // payments differ by a month of forecast inflation by design.
          const mismatch =
            mode === "official" &&
            reported !== null &&
            reported > 0 &&
            track.kind !== "fixedLinked" &&
            track.kind !== "variableLinked" &&
            Math.abs(computed - reported) > PAYMENT_MISMATCH_RATIO * reported;
          const loan = loans[track.loanIndex];
          return (
            <li key={`${track.loanIndex}-${track.trackIndex}`} className="glass-track px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  <span className="font-medium">{labels.forecastKinds[track.kind]}</span>
                  <span className="ms-2 text-slate-500" dir="auto">
                    {fillTemplate(labels.forecastTrackLine, {
                      label: [loan.loanNumber, track.label].filter(Boolean).join(" · "),
                      count: track.numberOfPayments,
                      end: formatMonth(track.lastPaymentDate.slice(0, 7)),
                    })}
                  </span>
                </span>
                <span className="tabular-nums font-medium" dir="ltr">{money(computed)}</span>
              </div>
              {mismatch && (
                <p className="mt-1 text-xs text-amber-800">
                  {fillTemplate(labels.forecastPaymentMismatch, { computed: money(computed), reported: money(reported) })}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {(assumptions.length > 0 || simulation.curveId) && (
        <ul className="mt-4 space-y-1 text-xs text-slate-500">
          {assumptions.map((assumption) => (
            <li key={assumption}>{labels.forecastAssumptions[assumption]}</li>
          ))}
          {simulation.curveId && <li>{fillTemplate(labels.forecastCurve, { curve: simulation.curveId })}</li>}
        </ul>
      )}
      <p className="mt-4 text-xs leading-5 text-slate-500">{labels.forecastDisclaimer}</p>
    </section>
  );
}
