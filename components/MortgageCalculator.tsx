"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/i18n/config";
// Type-only import: erased at compile time, so the server-only dictionary
// module is never bundled into this Client Component.
import type { Dictionary } from "@/app/[locale]/dictionaries";
import {
  calculateScenarioSummary,
  nominalAnnualPercentToEffectiveAnnualPercent,
  type MortgageTrackInput,
  type ScenarioSummary,
} from "@/lib/mortgage";
import {
  applyTracksToQuery,
  createTrackDraft,
  duplicateTrackDraft,
  formatAmountForDisplay,
  isPinnedCurveMissing,
  MAX_TRACKS,
  MIN_TRACKS,
  parseAllTrackDrafts,
  parseTracksFromQuery,
  resolveForecastCurve,
  sumEnteredTrackAmounts,
  type MarketContextForParsing,
  type TrackDraft,
} from "@/lib/mortgage/scenario-form";
import type { MortgageForecastCurveSnapshot } from "@/lib/market-data/mortgage-forecast-types";
import AmortizationSchedule from "./AmortizationSchedule";
import MortgageTrackCard, {
  type TrackCardMarketInfo,
} from "./MortgageTrackCard";
import ScheduleSelector from "./ScheduleSelector";

const COMBINED_SCHEDULE_ID = "combined";

type CalculatorLabels = Dictionary["calculator"];

/** Normalized serializable market data the page passes down. */
export interface CalculatorMarketData {
  boiRatePercent: number;
  /** Effective official forecast curves, newest first. */
  curves: MortgageForecastCurveSnapshot[];
  curveStatus: "live" | "fallback";
}

interface MortgageCalculatorProps {
  locale: Locale;
  labels: CalculatorLabels;
  marketData: CalculatorMarketData;
}

/** A successfully calculated mix: the inputs it was computed from + result. */
interface SubmittedScenario {
  inputs: MortgageTrackInput[];
  summary: ScenarioSummary;
}

function tryCalculateScenario(
  inputs: MortgageTrackInput[],
): ScenarioSummary | null {
  try {
    return calculateScenarioSummary({ tracks: inputs });
  } catch {
    return null;
  }
}

export default function MortgageCalculator({
  locale,
  labels,
  marketData,
}: MortgageCalculatorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const market: MarketContextForParsing = {
    boiRatePercent: marketData.boiRatePercent,
    curves: marketData.curves,
  };

  // Initialize once from the URL (indexed multi-track format, or the legacy
  // single-track params from old shared links). A fully valid URL restores
  // the calculated result as well.
  const [initial] = useState(() => {
    const drafts = parseTracksFromQuery(searchParams) ?? [createTrackDraft()];
    const inputs = parseAllTrackDrafts(drafts, market);
    const summary = inputs ? tryCalculateScenario(inputs) : null;
    return {
      drafts,
      submitted: inputs && summary ? { inputs, summary } : null,
    };
  });

  const [drafts, setDrafts] = useState<TrackDraft[]>(initial.drafts);
  const [submitted, setSubmitted] = useState<SubmittedScenario | null>(
    initial.submitted,
  );
  const [hasError, setHasError] = useState(false);
  // Which schedule the amortization table shows; purely local view state.
  const [selectedScheduleId, setSelectedScheduleId] =
    useState(COMBINED_SCHEDULE_ID);

  const intlLocale = locale === "he" ? "he-IL" : "en-US";
  const currencyFormat = new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  });
  const wholeCurrencyFormat = new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  });
  const numberFormat = new Intl.NumberFormat(intlLocale);
  const percentFormat = new Intl.NumberFormat(intlLocale, {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const monthYearFormat = new Intl.DateTimeFormat(intlLocale, {
    month: "long",
    year: "numeric",
  });

  function curveReferenceLabel(curve: MortgageForecastCurveSnapshot): string {
    const month = monthYearFormat.format(
      new Date(Date.UTC(curve.referenceYear, curve.referenceMonth - 1, 1)),
    );
    const average =
      curve.averageType === "calendar"
        ? labels.averageCalendar
        : labels.averageIndex;
    return `${month} · ${average}`;
  }

  function marketInfoForDraft(draft: TrackDraft): TrackCardMarketInfo {
    const curve = resolveForecastCurve(draft, market);
    return {
      boiRatePercent: marketData.boiRatePercent,
      primeRatePercent:
        Math.round((marketData.boiRatePercent + 1.5) * 100) / 100,
      curveReferenceLabel: curve
        ? curveReferenceLabel(curve as MortgageForecastCurveSnapshot)
        : "—",
      curveIsFallback:
        marketData.curveStatus === "fallback" ||
        (curve as MortgageForecastCurveSnapshot | null)?.status === "fallback",
      curveIsMissing: isPinnedCurveMissing(draft, market),
    };
  }

  /** Write the current drafts into the URL (removes stale/legacy params). */
  function syncQuery(nextDrafts: TrackDraft[]) {
    const query = new URLSearchParams(searchParams.toString());
    applyTracksToQuery(query, nextDrafts);
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  }

  function updateTrack(
    id: string,
    field: keyof Omit<TrackDraft, "id">,
    value: string,
  ) {
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === id ? { ...draft, [field]: value } : draft,
      ),
    );
  }

  function handleAmountBlur(id: string) {
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === id
          ? { ...draft, amount: formatAmountForDisplay(draft.amount) }
          : draft,
      ),
    );
  }

  function addTrack() {
    if (drafts.length >= MAX_TRACKS) return;
    const next = [...drafts, createTrackDraft()];
    setDrafts(next);
    syncQuery(next);
  }

  function removeTrack(id: string) {
    if (drafts.length <= MIN_TRACKS) return;
    const next = drafts.filter((draft) => draft.id !== id);
    setDrafts(next);
    syncQuery(next);
  }

  function duplicateTrack(id: string) {
    if (drafts.length >= MAX_TRACKS) return;
    const index = drafts.findIndex((draft) => draft.id === id);
    if (index === -1) return;
    const next = [
      ...drafts.slice(0, index + 1),
      duplicateTrackDraft(drafts[index]),
      ...drafts.slice(index + 1),
    ];
    setDrafts(next);
    syncQuery(next);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const inputs = parseAllTrackDrafts(drafts, market);
    const summary = inputs ? tryCalculateScenario(inputs) : null;
    if (!inputs || !summary) {
      setSubmitted(null);
      setHasError(true);
      return;
    }

    // Stamp the curve each prime track actually used, so the URL pins it
    // and a shared link reproduces this exact calculation.
    const stamped = drafts.map((draft, index) => {
      const input = inputs[index];
      return input.type === "prime"
        ? { ...draft, forecastCurveId: input.forecastCurveId ?? "" }
        : draft;
    });

    setDrafts(stamped);
    setSubmitted({ inputs, summary });
    setHasError(false);
    setSelectedScheduleId(COMBINED_SCHEDULE_ID);
    syncQuery(stamped);
  }

  const enteredTotal = sumEnteredTrackAmounts(drafts);

  const combinedResults = submitted
    ? [
        {
          label: labels.totalAmountLabel,
          value: wholeCurrencyFormat.format(
            submitted.inputs.reduce((sum, input) => sum + input.loanAmount, 0),
          ),
          help: undefined,
        },
        {
          label: labels.combinedFirstPayment,
          value: currencyFormat.format(submitted.summary.monthlyPayment),
          help: labels.combinedFirstPaymentHelp,
        },
        {
          label: labels.totalPayment,
          value: currencyFormat.format(submitted.summary.totalPayment),
          help: labels.totalPaymentHelp,
        },
        {
          label: labels.totalInterest,
          value: currencyFormat.format(submitted.summary.totalInterest),
          help: labels.totalInterestHelp,
        },
        {
          label: labels.numberOfPayments,
          value: numberFormat.format(submitted.summary.numberOfPayments),
          help: undefined,
        },
      ]
    : [];

  const fieldExplanations = [
    { term: labels.trackAmountLabel, explanation: labels.trackAmountHelp },
    { term: labels.trackTypeLabel, explanation: labels.trackTypeHelp },
    {
      term: labels.repaymentMethodLabel,
      explanation: labels.repaymentMethodHelp,
    },
    { term: labels.yearsLabel, explanation: labels.yearsHelp },
    { term: labels.interestRateLabel, explanation: labels.interestRateHelp },
  ];

  const hasPrimeTrack =
    submitted?.inputs.some((input) => input.type === "prime") ?? false;
  const hasScenarioOverride =
    submitted?.inputs.some(
      (input) => input.type === "prime" && input.forecastMode !== "official",
    ) ?? false;

  // Which schedule is on display. Falls back to combined if the selection
  // no longer exists (e.g. fewer tracks after a recalculation).
  const selectedTrackIndex =
    submitted && selectedScheduleId !== COMBINED_SCHEDULE_ID
      ? Number(selectedScheduleId)
      : null;
  const selectedTrackSummary =
    submitted &&
    selectedTrackIndex !== null &&
    submitted.summary.trackSummaries[selectedTrackIndex] !== undefined
      ? submitted.summary.trackSummaries[selectedTrackIndex]
      : null;

  const isSingleTrack = submitted !== null && submitted.inputs.length === 1;
  const displayedSchedule = submitted
    ? isSingleTrack
      ? submitted.summary.trackSummaries[0].schedule
      : (selectedTrackSummary?.schedule ?? submitted.summary.combinedSchedule)
    : [];
  const scheduleTitle = submitted
    ? isSingleTrack
      ? labels.scheduleTitle
      : selectedTrackSummary !== null && selectedTrackIndex !== null
        ? `${labels.scheduleTitle} — ${labels.trackLabel} ${selectedTrackIndex + 1}`
        : labels.scheduleTitleCombined
    : labels.scheduleTitle;

  const scheduleOptions = submitted
    ? [
        { id: COMBINED_SCHEDULE_ID, label: labels.combinedLabel },
        ...submitted.inputs.map((_, index) => ({
          id: String(index),
          label: `${labels.trackLabel} ${index + 1}`,
        })),
      ]
    : [];

  const showPerTrackSection =
    submitted !== null && (!isSingleTrack || hasPrimeTrack);

  return (
    <div className="w-full">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-slate-600">
          <span>
            {labels.tracksCountLabel}:{" "}
            <strong className="text-slate-900">
              {numberFormat.format(drafts.length)}
            </strong>
          </span>
          <span>
            {labels.totalAmountLabel}:{" "}
            <strong className="text-slate-900">
              {wholeCurrencyFormat.format(enteredTotal)}
            </strong>
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {drafts.map((draft, index) => (
            <MortgageTrackCard
              key={draft.id}
              index={index}
              draft={draft}
              labels={labels}
              market={marketInfoForDraft(draft)}
              canRemove={drafts.length > MIN_TRACKS}
              canDuplicate={drafts.length < MAX_TRACKS}
              onChange={(field, value) => updateTrack(draft.id, field, value)}
              onAmountBlur={() => handleAmountBlur(draft.id)}
              onRemove={() => removeTrack(draft.id)}
              onDuplicate={() => duplicateTrack(draft.id)}
            />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-6 py-2.5 text-white transition hover:bg-slate-700"
          >
            {labels.calculateButton}
          </button>
          {drafts.length < MAX_TRACKS && (
            <button
              type="button"
              onClick={addTrack}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm text-slate-700 transition hover:bg-slate-100"
            >
              {labels.addTrack}
            </button>
          )}
        </div>

        <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            {labels.fieldHelpTitle}
          </summary>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {fieldExplanations.map((item) => (
              <div key={item.term}>
                <dt className="font-medium text-slate-700">{item.term}</dt>
                <dd className="leading-6 text-slate-600">{item.explanation}</dd>
              </div>
            ))}
          </dl>
        </details>
      </form>

      {hasError && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {labels.invalidInput}
        </p>
      )}

      {submitted && (
        <>
          <section className="mt-6">
            <h2 className="mb-3 text-2xl font-bold tracking-tight">
              {labels.combinedResultsTitle}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {combinedResults.map((result) => (
                <div
                  key={result.label}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="text-sm text-slate-500">{result.label}</div>
                  <div className="mt-1 text-xl font-bold text-slate-900">
                    {result.value}
                  </div>
                  {result.help && (
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">
                      {result.help}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {hasScenarioOverride && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                {labels.stressScenarioNote}
              </p>
            )}
            <p className="mt-3 text-sm leading-6 text-slate-500">
              {labels.mixHelp}
            </p>
            {hasPrimeTrack && (
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {labels.primeForecastExplanation}
              </p>
            )}
          </section>

          {showPerTrackSection && (
            <section className="mt-6">
              <h2 className="mb-3 text-2xl font-bold tracking-tight">
                {labels.perTrackResultsTitle}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {submitted.inputs.map((input, index) => {
                  const trackSummary = submitted.summary.trackSummaries[index];
                  const isEqualPrincipal =
                    input.repaymentMethod === "equalPrincipal";
                  const methodLabel = isEqualPrincipal
                    ? labels.repaymentMethodEqualPrincipal
                    : labels.repaymentMethodSpitzer;

                  const commonRows = [
                    {
                      label: labels.trackAmountLabel,
                      value: wholeCurrencyFormat.format(input.loanAmount),
                    },
                    {
                      label: labels.yearsLabel,
                      value:
                        input.years === 1
                          ? labels.yearSingular
                          : `${numberFormat.format(input.years)} ${labels.yearsPlural}`,
                    },
                  ];

                  const rows =
                    input.type === "prime" && trackSummary.forecast
                      ? [
                          ...commonRows,
                          {
                            label: labels.primeOfferedRateLabel,
                            value: percentFormat.format(
                              input.currentCustomerRatePercent / 100,
                            ),
                          },
                          {
                            label: labels.currentFirstPaymentLabel,
                            value: currencyFormat.format(
                              trackSummary.forecast.currentFirstPayment,
                            ),
                          },
                          {
                            label: labels.forecastMaxPaymentLabel,
                            value: `${currencyFormat.format(
                              trackSummary.forecast.forecastMaximumPayment,
                            )} (${labels.inMonthPrefix}${numberFormat.format(
                              trackSummary.forecast
                                .monthOfForecastMaximumPayment,
                            )})`,
                          },
                          {
                            label: labels.forecastTotalPaymentLabel,
                            value: currencyFormat.format(
                              trackSummary.forecast.forecastTotalPayment,
                            ),
                          },
                          {
                            label: labels.forecastTotalInterestLabel,
                            value: currencyFormat.format(
                              trackSummary.forecast.forecastTotalInterest,
                            ),
                          },
                          {
                            label: labels.forecastOverallRateLabel,
                            value: percentFormat.format(
                              trackSummary.forecast.forecastOverallRatePercent /
                                100,
                            ),
                          },
                        ]
                      : [
                          ...commonRows,
                          {
                            label: labels.interestRateLabel,
                            value: percentFormat.format(
                              (input.type === "fixedUnlinked"
                                ? input.annualInterestRatePercent
                                : 0) / 100,
                            ),
                          },
                          {
                            label: labels.effectiveRateLabel,
                            value: percentFormat.format(
                              nominalAnnualPercentToEffectiveAnnualPercent(
                                input.type === "fixedUnlinked"
                                  ? input.annualInterestRatePercent
                                  : 0,
                              ) / 100,
                            ),
                          },
                          ...(isEqualPrincipal
                            ? [
                                {
                                  label: labels.firstPaymentLabel,
                                  value: currencyFormat.format(
                                    trackSummary.firstPayment,
                                  ),
                                },
                                {
                                  label: labels.lastPaymentLabel,
                                  value: currencyFormat.format(
                                    trackSummary.lastPayment,
                                  ),
                                },
                              ]
                            : [
                                {
                                  label: labels.monthlyPayment,
                                  value: currencyFormat.format(
                                    trackSummary.monthlyPayment,
                                  ),
                                },
                              ]),
                          {
                            label: labels.totalPayment,
                            value: currencyFormat.format(
                              trackSummary.totalPayment,
                            ),
                          },
                          {
                            label: labels.totalInterest,
                            value: currencyFormat.format(
                              trackSummary.totalInterest,
                            ),
                          },
                        ];

                  return (
                    <div
                      key={index}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <h3 className="mb-2 text-sm font-bold text-slate-900">
                        {labels.trackLabel} {index + 1}
                        <span className="font-normal text-slate-500">
                          {" · "}
                          {input.type === "prime"
                            ? labels.trackTypePrime
                            : labels.trackTypeFixedUnlinked}
                          {" · "}
                          {methodLabel}
                        </span>
                      </h3>
                      <dl className="space-y-1 text-sm">
                        {rows.map((row) => (
                          <div
                            key={row.label}
                            className="flex items-baseline justify-between gap-2"
                          >
                            <dt className="text-slate-500">{row.label}</dt>
                            <dd className="text-end font-medium text-slate-900">
                              {row.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <AmortizationSchedule
            // Remount on a new calculation or view switch so scroll resets.
            key={`${selectedScheduleId}-${submitted.summary.numberOfPayments}-${submitted.summary.monthlyPayment}-${submitted.summary.totalInterest}`}
            schedule={displayedSchedule}
            labels={labels}
            locale={locale}
            title={scheduleTitle}
            selector={
              isSingleTrack ? undefined : (
                <ScheduleSelector
                  options={scheduleOptions}
                  selectedId={
                    selectedTrackSummary !== null && selectedTrackIndex !== null
                      ? String(selectedTrackIndex)
                      : COMBINED_SCHEDULE_ID
                  }
                  onSelect={setSelectedScheduleId}
                />
              )
            }
          />
        </>
      )}

      <p className="mt-5 text-sm leading-6 text-slate-500">
        {labels.disclaimer}
      </p>
    </div>
  );
}
