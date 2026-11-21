"use client";

import { useMemo, useState } from "react";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import type { ComparisonScenario } from "@/lib/scenarios/comparison";
import {
  combinePayoffFiles,
  existingCombinedBases,
  existingMilestones,
  existingTrackBasis,
  fillTemplate,
  formatMoney,
  simulateExistingMortgage,
  type ExistingForecastMode,
  type ExistingMortgageMarket,
  type PayoffLoan,
} from "@/lib/payoff-report";

import AmortizationSchedule from "./AmortizationSchedule";
import PaymentTimeline from "./PaymentTimeline";
import RefinanceComparison from "./RefinanceComparison";
import ScheduleSelector from "./ScheduleSelector";

type Labels = Dictionary["payoffPage"];
const COMBINED = "combined";

/** A computed first payment this far off the report's suggests a misread. */
const PAYMENT_MISMATCH_RATIO = 0.01;

function formatMonth(month: string | null): string {
  if (month === null) return "";
  const [year, number] = month.split("-");
  return `${number}/${year}`;
}

/**
 * The confirmed loans simulated from today on: headline figures, a line
 * per track, the payment over time and the amortization schedule, reusing
 * the calculator's own chart and table on the simulated schedule.
 */
export default function ExistingMortgageForecast({
  loans,
  market,
  labels,
  calculatorLabels,
  locale,
  comparison,
}: {
  loans: PayoffLoan[];
  market: ExistingMortgageMarket;
  labels: Labels;
  calculatorLabels: Dictionary["calculator"];
  locale: Locale;
  /** Saved mixes to weigh against; omitted where comparing is not offered. */
  comparison?: { mixes: ComparisonScenario[]; labels: Dictionary["savedComparison"] };
}) {
  const [mode, setMode] = useState<ExistingForecastMode>("official");
  const [scheduleId, setScheduleId] = useState(COMBINED);
  // The initial view and the refinance comparison share the official forecast.
  const officialSimulation = useMemo(() => simulateExistingMortgage(loans, market, "official"), [loans, market]);
  const simulation = useMemo(() => mode === "official" ? officialSimulation : simulateExistingMortgage(loans, market, mode),
    [mode, officialSimulation, loans, market]);
  const reportTotals = useMemo(() => combinePayoffFiles([{ fileName: "", loans }]).totals, [loans]);
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
  const trackName = (track: (typeof simulation.tracks)[number]) =>
    [loans[track.loanIndex].loanNumber, track.label].filter(Boolean).join(" · ");

  const selectedTrack = simulation.tracks.find((track) => `${track.loanIndex}-${track.trackIndex}` === scheduleId) ?? null;
  const schedule = selectedTrack ? selectedTrack.schedule : simulation.combinedSchedule;
  const rowBases = useMemo(
    () =>
      selectedTrack
        ? selectedTrack.schedule.map((entry) => existingTrackBasis(selectedTrack, entry.month))
        : existingCombinedBases(simulation),
    [selectedTrack, simulation],
  );
  const scheduleOptions = [
    { id: COMBINED, label: calculatorLabels.combinedLabel },
    ...simulation.tracks.map((track) => ({ id: `${track.loanIndex}-${track.trackIndex}`, label: trackName(track) })),
  ];

  if (simulation.skipped.length > 0) {
    return (
      <section className="glass-panel px-5 py-6">
        <h2 className="text-xl font-semibold">{labels.forecastHeading}</h2>
        <p className="mt-2 text-sm leading-6">{labels.forecastIncomplete}</p>
      </section>
    );
  }

  return (
    <>
    <section aria-labelledby="existing-forecast-heading" className="glass-panel mb-6 px-5 py-6 sm:px-6">
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
          return (
            <li key={`${track.loanIndex}-${track.trackIndex}`} className="glass-track px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  <span className="font-medium">{labels.forecastKinds[track.kind]}</span>
                  <span className="ms-2 text-slate-500" dir="auto">
                    {fillTemplate(labels.forecastTrackLine, {
                      label: trackName(track),
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

      {simulation.combinedSchedule.length > 0 && (
        <>
          <PaymentTimeline
            // Remount when the figures change so the marker starts at month 1.
            key={`${mode}-${simulation.totals.totalPayment}`}
            schedule={simulation.combinedSchedule}
            tracks={[]}
            locale={locale}
            labels={calculatorLabels}
            milestones={existingMilestones(simulation)}
            trackNames={simulation.tracks.map(trackName)}
            monthLabels={simulation.months.map((month) => formatMonth(month.month))}
          />
          <div className="mt-6">
            <AmortizationSchedule
              key={`${mode}-${scheduleId}-${simulation.totals.totalPayment}`}
              schedule={schedule}
              rowBases={rowBases}
              labels={calculatorLabels}
              locale={locale}
              title={selectedTrack ? `${calculatorLabels.scheduleTitle} — ${trackName(selectedTrack)}` : calculatorLabels.scheduleTitleCombined}
              rateColumnHeader={selectedTrack ? calculatorLabels.rateHeader : calculatorLabels.weightedRateHeader}
              notes={selectedTrack ? [] : [calculatorLabels.weightedRateNote]}
              selector={
                simulation.tracks.length > 1 ? (
                  <ScheduleSelector options={scheduleOptions} selectedId={scheduleId} onSelect={setScheduleId} />
                ) : undefined
              }
            />
          </div>
        </>
      )}
    </section>
    {comparison && (reportTotals.totalToSettle === null || reportTotals.fees === null ? (
      <section className="glass-panel px-5 py-6">
        <h2 className="text-xl font-semibold">{labels.compareHeading}</h2>
        <p className="mt-2 text-sm leading-6">{labels.compareIncomplete}</p>
      </section>
    ) : (
      <RefinanceComparison
        loans={loans}
        simulation={officialSimulation}
        balanceToSettle={reportTotals.totalToSettle}
        fees={reportTotals.fees}
        mixes={comparison.mixes}
        labels={labels}
        comparisonLabels={comparison.labels}
        locale={locale}
      />
    ))}
    </>
  );
}
