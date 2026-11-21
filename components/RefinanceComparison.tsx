"use client";

import Link from "next/link";
import { memo, useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import {
  compareRefinance,
  fillTemplate,
  formatMoney,
  type ExistingMortgageSimulation,
  type PayoffLoan,
} from "@/lib/payoff-report";
import { currentMixHref, longestRemainingMonths, newMixHref } from "@/lib/payoff-report/to-calculator";
import type { ComparisonScenario } from "@/lib/scenarios/comparison";
import { loadComparisonPayments } from "@/lib/scenarios/comparison-actions";
import ComparisonPaymentCharts from "./ComparisonPaymentCharts";

type Labels = Dictionary["payoffPage"];
const MY_MORTGAGE_ID = "my-mortgage";

/**
 * The current mortgage, continued as simulated, next to one saved mix taken
 * out today instead. Uses the saved-comparison charts with "my mortgage" as
 * one of the lines.
 */
const RefinanceComparison = memo(function RefinanceComparison({
  loans,
  simulation,
  balanceToSettle,
  fees,
  mixes,
  labels,
  comparisonLabels,
  locale,
}: {
  loans: PayoffLoan[];
  /** Always the official-forecast simulation: saved mixes use the official forecast too. */
  simulation: ExistingMortgageSimulation;
  balanceToSettle: number;
  fees: number;
  mixes: ComparisonScenario[];
  labels: Labels;
  comparisonLabels: Dictionary["savedComparison"];
  locale: Locale;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(mixes[0]?.id ?? null);
  const [extraCosts, setExtraCosts] = useState<Record<string, string>>({});
  // Payment series per mix, fetched once the first time a mix is selected.
  const [payments, setPayments] = useState<Record<string, number[] | null>>({});
  const requested = useRef(new Set<string>());
  const money = (value: number) => formatMoney(value, locale);
  const selected = mixes.find((mix) => mix.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId === null || requested.current.has(selectedId)) return;
    requested.current.add(selectedId);
    void loadComparisonPayments([selectedId]).catch(() => null).then((loaded) => {
      setPayments((current) => ({ ...current, [selectedId]: loaded?.[selectedId] ?? null }));
    });
  }, [selectedId]);

  // Calculator shortcuts: a new mix on the whole balance to settle (what a
  // refinance must fund), or the current mix as a starting point.
  const fromCurrent = currentMixHref(locale, loans);
  const shortcuts = (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <Link
          href={newMixHref(locale, balanceToSettle, longestRemainingMonths(loans))}
          className="glass-button inline-flex min-h-11 items-center px-5 text-sm font-medium"
        >
          {fillTemplate(labels.compareNewMix, { amount: money(balanceToSettle) })}
        </Link>
        {fromCurrent && (
          <Link href={fromCurrent.href} className="glass-secondary inline-flex min-h-11 items-center px-5 text-sm font-medium">
            {labels.compareFromCurrent}
          </Link>
        )}
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        {labels.compareShortcutsHelp}
        {fromCurrent?.approximated && <> {labels.compareFromCurrentNote}</>}
      </p>
    </div>
  );

  if (mixes.length === 0) {
    return (
      <section className="glass-panel px-6 py-8">
        <h2 className="text-xl font-semibold tracking-tight">{labels.compareHeading}</h2>
        <p className="mt-2 text-sm text-slate-500">{labels.compareNone}</p>
        {shortcuts}
      </section>
    );
  }

  const mixPayments = selected ? payments[selected.id] : undefined;
  const extra = (selected && extraCosts[selected.id]) || "";
  const cashAmount = Number(extra.replaceAll(",", ""));
  const extraValid = extra === "" || (/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{0,2})?$/.test(extra)
    && Number.isSafeInteger(Math.round(cashAmount * 100)));
  const result = selected && extraValid
    ? compareRefinance(simulation, balanceToSettle, fees, {
        firstPayment: selected.result.firstPayment,
        highestPayment: selected.result.highestPayment,
        forecastTotalPaid: selected.result.forecastTotalPaid,
        totalPrincipal: selected.result.totalPrincipal,
        years: selected.years,
        trackCount: selected.result.trackCount,
      }, mixPayments, cashAmount)
    : null;

  const mine: ComparisonScenario = {
    ...(selected as ComparisonScenario),
    id: MY_MORTGAGE_ID,
    name: labels.compareCurrent,
    years: simulation.combinedSchedule.length / 12,
    payments: simulation.combinedSchedule.map((entry) => entry.payment),
  };

  const rows: [string, string, string][] = result
    ? [
        [labels.compareRowFirst, money(result.current.firstPayment), money(result.mix.firstPayment)],
        [labels.compareRowHighest, money(result.current.highestPayment), money(result.mix.highestPayment)],
        [labels.compareRowTotal, money(result.current.totalPayment), money(result.mix.totalPayment)],
        [labels.compareRowFinancedFees, "—", money(result.financedFees)],
        [labels.compareRowCashFees, "—", money(result.cashFees)],
        [labels.compareOtherCosts, "—", money(cashAmount)],
        [labels.compareRowTotalWithFees, money(result.current.totalPayment), money(result.mixTotalWithFees)],
        [labels.compareRowYears, (result.current.months / 12).toFixed(1), (result.mix.months / 12).toFixed(1)],
      ]
    : [];

  return (
    <section aria-labelledby="refinance-heading" className="glass-panel px-5 py-6 sm:px-6">
      <h2 id="refinance-heading" className="text-xl font-semibold tracking-tight">{labels.compareHeading}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">{labels.compareIntro}</p>
      {shortcuts}

      <fieldset className="mt-5">
        <legend className="mb-2 text-sm font-medium">{labels.compareChoose}</legend>
        <div className="flex flex-wrap gap-2">
          {mixes.map((mix) => (
            <button
              key={mix.id}
              type="button"
              aria-pressed={mix.id === selectedId}
              onClick={() => setSelectedId(mix.id)}
              className={`min-h-10 rounded-full border px-4 text-sm transition-colors ${
                mix.id === selectedId ? "border-accent bg-accent-soft font-medium text-accent" : "border-black/10 hover:bg-black/5"
              }`}
            >
              <bdi>{mix.name}</bdi>
            </button>
          ))}
        </div>
      </fieldset>

      {selected && (
        <div className="glass-form mt-4 text-sm">
          <label htmlFor="refinance-extra-costs">{labels.compareOtherCosts}</label>
          <input id="refinance-extra-costs" type="text" inputMode="decimal" dir="ltr" placeholder="0" value={extra}
            aria-describedby="refinance-fee-notice" aria-invalid={!extraValid} className="mt-1 block w-full max-w-sm border px-3"
            onChange={(event) => {
              const value = event.target.value.trim();
              setExtraCosts((current) => ({ ...current, [selected.id]: value }));
            }} />
          {!extraValid && <span role="alert" className="text-red-700">{labels.compareCostInvalid}</span>}
          <p id="refinance-fee-notice" className="mt-2 max-w-prose leading-6 text-slate-600">{labels.compareFeeNotice}</p>
        </div>
      )}

      {result && selected && (
        <>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="text-xs text-slate-500">
                  <th className="py-2 text-start font-medium" />
                  <th className="py-2 text-start font-medium">{labels.compareCurrent}</th>
                  <th className="py-2 text-start font-medium"><bdi>{selected.name}</bdi></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, current, mix]) => (
                  <tr key={label} className="border-t border-black/5">
                    <th scope="row" className="py-2.5 text-start font-normal text-slate-600">{label}</th>
                    <td className="py-2.5 tabular-nums" dir="ltr">{current}</td>
                    <td className="py-2.5 tabular-nums" dir="ltr">{mix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.principalMatches && <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${result.difference >= 0 ? "bg-accent-soft text-accent-strong" : "bg-amber-50 text-amber-900"}`}>
            <p className="font-medium">
              {fillTemplate(result.difference >= 0 ? labels.compareSaving : labels.compareExtra, {
                amount: money(Math.abs(result.difference)),
              })}
            </p>
            {/* Only when refinancing comes out ahead overall: a longer, pricier mix
                with lower payments also "recovers" its fees month by month. */}
            {result.difference >= 0 && result.breakEvenMonth !== null && (
              <p className="mt-1">
                {fillTemplate(labels.compareBreakEven, { years: (result.breakEvenMonth / 12).toFixed(1) })}
              </p>
            )}
          </div>}

          {!result.principalMatches && (
            <p className="mt-3 text-sm text-amber-800">
              {fillTemplate(labels.comparePrincipalMismatch, {
                mix: money(selected.result.totalPrincipal),
                current: money(result.balanceToSettle),
              })}
            </p>
          )}

          {mixPayments === undefined ? (
            <p className="mt-4 text-sm text-slate-500" role="status">{comparisonLabels.chartsLoading}</p>
          ) : mixPayments === null ? (
            <p className="mt-4 text-sm text-slate-500">{comparisonLabels.chartUnavailable}</p>
          ) : (
            <ComparisonPaymentCharts
              scenarios={[mine, { ...selected, payments: mixPayments }]}
              locale={locale}
              labels={comparisonLabels}
            />
          )}
          <p className="mt-4 text-xs leading-5 text-slate-500">{labels.compareNote}</p>
        </>
      )}
    </section>
  );
});

export default RefinanceComparison;
