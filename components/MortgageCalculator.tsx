"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/i18n/config";
import { formatDateOnly, formatDateTimeIsrael } from "@/lib/forms/dates";
import { freshnessStatusText } from "@/lib/forms/freshness";
import type { CalculatorMarketData } from "@/lib/market-data/build-calculator-market-data";
// Type-only import: erased at compile time, so the server-only dictionary
// module is never bundled into this Client Component.
import type { Dictionary } from "@/app/[locale]/dictionaries";
import {
  calculateScenarioSummary,
  combinedStabilityScore,
  nominalAnnualPercentToEffectiveAnnualPercent,
  paymentMonthParts,
  stabilityColorState,
  stabilityKeyForTrackType,
  stabilityLevel,
  trackStabilityScore,
  type MortgageTrackInput,
  type ScenarioSummary,
  type StabilityColorState,
  type StabilityLevel,
} from "@/lib/mortgage";
import {
  isGovernmentBondResetMonths,
  isGovernmentBondTermValid,
} from "@/lib/mortgage/product-catalog";
import {
  applyTracksToQuery,
  classifyCurveFreshnessRole,
  createTrackDraft,
  duplicateTrackDraft,
  formatAmountForDisplay,
  isPinnedCurveMissing,
  isPinnedMakamSnapshotMissing,
  MAX_TRACKS,
  MIN_TRACKS,
  parseAllTrackDrafts,
  parseTracksFromQuery,
  resolveForecastCurve,
  resolveMakamSnapshot,
  sumEnteredTrackAmounts,
  validateTrackDraft,
  type MarketContextForParsing,
  type TrackDraft,
  type TrackFieldErrors,
} from "@/lib/mortgage/scenario-form";
import type { MakamAnchorSnapshot } from "@/lib/market-data/mortgage-forecast-types";
import type { MortgageForecastCurveSnapshot } from "@/lib/market-data/mortgage-forecast-types";
import AmortizationSchedule from "./AmortizationSchedule";
import CopyLinkButton from "./CopyLinkButton";
import MortgageTrackCard, {
  type TrackCardMarketInfo,
} from "./MortgageTrackCard";
import ScheduleSelector from "./ScheduleSelector";

const COMBINED_SCHEDULE_ID = "combined";

type CalculatorLabels = Dictionary["calculator"];

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

interface FreshnessRowData {
  label: string;
  value: ReactNode;
}

/** One label/value line inside a freshness mini-card. Values that are
 * dates or IDs stay LTR even inside the Hebrew (RTL) layout so digits and
 * separators never get visually reordered by the bidi algorithm. */
function FreshnessRow({ label, value }: FreshnessRowData) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-slate-400">{label}</dt>
      <dd dir="ltr" className="text-end text-slate-600">
        {value}
      </dd>
    </div>
  );
}

/** A single compact source card: a heading plus a handful of labeled facts
 * (reference period, publication/effective/checked dates, status), kept as
 * separate rows so they are never mashed into one ambiguous sentence. */
function FreshnessCard({
  title,
  rows,
  technical,
  technicalTitle,
}: {
  title: string;
  rows: FreshnessRowData[];
  /** Optional raw/technical facts (e.g. a curve ID) tucked behind their own
   * disclosure instead of sitting in the default view. */
  technical?: FreshnessRowData[];
  technicalTitle?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <dl className="mt-1 space-y-0.5 text-xs leading-5">
        {rows.map((row) => (
          <FreshnessRow key={row.label} label={row.label} value={row.value} />
        ))}
      </dl>
      {technical && technical.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-xs text-slate-400">
            {technicalTitle}
          </summary>
          <dl className="mt-1 space-y-0.5 text-xs leading-5">
            {technical.map((row) => (
              <FreshnessRow
                key={row.label}
                label={row.label}
                value={row.value}
              />
            ))}
          </dl>
        </details>
      )}
    </div>
  );
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
    makamSnapshots: marketData.makamSnapshots,
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

  // Jump-to-results: scroll only on an explicit user submit, never when a
  // shared link restores an already-submitted scenario on first load.
  const resultsRef = useRef<HTMLElement>(null);
  const justSubmittedRef = useRef(false);

  useEffect(() => {
    if (submitted && justSubmittedRef.current) {
      justSubmittedRef.current = false;
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [submitted]);

  function scrollToResults() {
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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

  /** All current sources are Bank of Israel adapters; falls back to the
   * raw ID for any future source that isn't. */
  function sourceDisplayName(sourceId: string): string {
    return sourceId.startsWith("boi-") ? labels.freshnessSourceBoi : sourceId;
  }

  function marketInfoForDraft(draft: TrackDraft): TrackCardMarketInfo {
    const curve = resolveForecastCurve(draft, market);
    const makamSnapshot =
      draft.trackType === "variableMakam"
        ? (resolveMakamSnapshot(draft, market) as MakamAnchorSnapshot | null)
        : null;
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
      makamAnchorLabel: makamSnapshot
        ? `${Math.round(makamSnapshot.anchorPercent * 100) / 100}% (${monthYearFormat.format(
            new Date(
              Date.UTC(
                makamSnapshot.referenceYear,
                makamSnapshot.referenceMonth - 1,
                1,
              ),
            ),
          )})`
        : null,
      makamAnchorIsMissing: isPinnedMakamSnapshotMissing(draft, market),
      expectedInflationLabel:
        draft.trackType === "fixedLinked" &&
        curve !== null &&
        ((curve as MortgageForecastCurveSnapshot).expectedCpiIndex?.length ??
          0) >= 13
          ? percentFormat.format(
              ((curve as MortgageForecastCurveSnapshot).expectedCpiIndex[12] /
                (curve as MortgageForecastCurveSnapshot).expectedCpiIndex[0] -
                1),
            )
          : null,
    };
  }

  /** Fills the localized "Month {m} — year {y}, month {my}" template. */
  function formatMaxMonth(month: number): string {
    const parts = paymentMonthParts(month);
    return labels.maxMonthTemplate
      .replace("{m}", numberFormat.format(parts.month))
      .replace("{y}", numberFormat.format(parts.year))
      .replace("{my}", numberFormat.format(parts.monthOfYear));
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
      current.map((draft) => {
        if (draft.id !== id) return draft;
        const next = { ...draft, [field]: value };
        // A term stays selected only if it is an exact option of the new
        // product/frequency; otherwise it clears and the user must make an
        // explicit valid choice — never a silent substitution.
        if (field === "resetPeriodMonths") {
          const reset = Number(value);
          if (
            !isGovernmentBondResetMonths(reset) ||
            !isGovernmentBondTermValid(reset, Number(next.years))
          ) {
            next.years = "";
          }
        }
        if (field === "trackType") {
          if (value === "variableGovernmentBond") {
            next.resetPeriodMonths = "";
            next.years = "";
          } else if (value === "variableMakam" || value === "fixedLinked") {
            next.resetPeriodMonths = "";
            if (!Number.isInteger(Number(next.years)) || next.years === "") {
              next.years = "";
            }
          }
          if (
            value === "variableGovernmentBond" ||
            value === "variableMakam" ||
            value === "fixedLinked"
          ) {
            next.repaymentMethod = "spitzer";
          }
        }
        return next;
      }),
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

    // Stamp the curve/anchor each variable-style track actually used, so
    // the URL pins them and a shared link reproduces this calculation.
    const stamped = drafts.map((draft, index) => {
      const input = inputs[index];
      if (input.type === "variableMakam") {
        return {
          ...draft,
          forecastCurveId: input.forecastCurveId ?? "",
          makamSnapshotId: input.makamSnapshotId ?? "",
        };
      }
      if (input.type === "prime" || input.type === "variableGovernmentBond") {
        return { ...draft, forecastCurveId: input.forecastCurveId ?? "" };
      }
      return draft;
    });

    justSubmittedRef.current = true;
    setDrafts(stamped);
    setSubmitted({ inputs, summary });
    setHasError(false);
    setSelectedScheduleId(COMBINED_SCHEDULE_ID);
    syncQuery(stamped);
  }

  const enteredTotal = sumEnteredTrackAmounts(drafts);

  const stabilityLevelLabels: Record<StabilityLevel, string> = {
    veryHigh: labels.stabilityVeryHigh,
    high: labels.stabilityHigh,
    medium: labels.stabilityMedium,
    low: labels.stabilityLow,
    veryLow: labels.stabilityVeryLow,
  };
  const formatStability = (score: number) =>
    `${numberFormat.format(Math.round(score))}/100 · ${stabilityLevelLabels[stabilityLevel(score)]}`;
  // Accessible, low-saturation tones + a non-color glyph per state, so the
  // meaning never relies on color alone. Green ≠ cheaper; red ≠ "never".
  const stabilityTone: Record<
    StabilityColorState,
    { badge: string; icon: string }
  > = {
    stable: {
      badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
      icon: "●",
    },
    moderate: {
      badge: "border-amber-200 bg-amber-50 text-amber-800",
      icon: "◐",
    },
    unstable: { badge: "border-red-200 bg-red-50 text-red-800", icon: "○" },
  };
  const StabilityBadge = ({ score }: { score: number }) => {
    const tone = stabilityTone[stabilityColorState(score)];
    return (
      <span
        className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${tone.badge}`}
      >
        <span aria-hidden>{tone.icon}</span> {formatStability(score)}
      </span>
    );
  };

  const scenarioStability = submitted
    ? combinedStabilityScore(
        submitted.inputs.map((input) => ({
          trackType: stabilityKeyForTrackType(input.type),
          loanAmount: input.loanAmount,
        })),
      )
    : 0;

  const scenarioTone = stabilityTone[stabilityColorState(scenarioStability)];
  const combinedResults = submitted
    ? [
        {
          label: labels.totalAmountLabel,
          value: wholeCurrencyFormat.format(
            submitted.inputs.reduce((sum, input) => sum + input.loanAmount, 0),
          ),
          help: undefined,
          tone: undefined as string | undefined,
          icon: undefined as string | undefined,
        },
        {
          // Always today's-rate payment: the single, beginner-friendly
          // first-payment number (forecast month 1 stays engine-internal).
          label: labels.firstMonthlyPaymentLabel,
          value: currencyFormat.format(
            submitted.summary.currentCombinedFirstPayment,
          ),
          help: undefined,
          tone: undefined,
          icon: undefined,
        },
        {
          label: labels.forecastMaxPaymentLabel,
          value: currencyFormat.format(submitted.summary.maximumPayment),
          help: formatMaxMonth(submitted.summary.monthOfMaximumPayment),
          tone: undefined,
          icon: undefined,
        },
        {
          label: labels.forecastTotalPaymentLabel,
          value: currencyFormat.format(submitted.summary.totalPayment),
          help: labels.totalPaymentHelp,
          tone: undefined,
          icon: undefined,
        },
        {
          label: labels.forecastTotalInterestLabel,
          value: currencyFormat.format(submitted.summary.totalInterest),
          help: labels.totalInterestHelp,
          tone: undefined,
          icon: undefined,
        },
        {
          label: labels.forecastOverallRateLabel,
          value: percentFormat.format(
            submitted.summary.forecastOverallRatePercent / 100,
          ),
          help: undefined,
          tone: undefined,
          icon: undefined,
        },
        {
          label: labels.numberOfPayments,
          value: numberFormat.format(submitted.summary.numberOfPayments),
          help: undefined,
          tone: undefined,
          icon: undefined,
        },
        {
          label:
            submitted.inputs.length > 1
              ? labels.stabilityCombinedLabel
              : labels.stabilityTrackLabel,
          value: formatStability(scenarioStability),
          help: labels.stabilityDimensionsHelp,
          tone: scenarioTone.badge,
          icon: scenarioTone.icon,
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

  const hasVariableStyleTrack =
    submitted?.inputs.some((input) => input.type !== "fixedUnlinked") ?? false;
  const hasScenarioOverride =
    submitted?.inputs.some(
      (input) =>
        input.type !== "fixedUnlinked" && input.forecastMode !== "official",
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

  // A prime/variable track in official/stress mode: its schedule is a
  // forecast and gets the BOI-curve title; constant mode stays ordinary.
  const isForecastSensitive = (input: MortgageTrackInput) =>
    input.type !== "fixedUnlinked" && input.forecastMode !== "constant";
  const displayedTrackInput = submitted
    ? isSingleTrack
      ? submitted.inputs[0]
      : selectedTrackSummary !== null && selectedTrackIndex !== null
        ? submitted.inputs[selectedTrackIndex]
        : null
    : null;
  const displayedIsForecast =
    displayedTrackInput !== null && isForecastSensitive(displayedTrackInput);
  const displayedIsCombined =
    submitted !== null && !isSingleTrack && selectedTrackSummary === null;
  const scenarioHasForecastTrack =
    submitted?.inputs.some(isForecastSensitive) ?? false;

  const trackScheduleBaseTitle = displayedIsForecast
    ? labels.forecastScheduleTitle
    : labels.scheduleTitle;
  const scheduleTitle = submitted
    ? isSingleTrack
      ? trackScheduleBaseTitle
      : selectedTrackSummary !== null && selectedTrackIndex !== null
        ? `${trackScheduleBaseTitle} — ${labels.trackLabel} ${selectedTrackIndex + 1}`
        : labels.scheduleTitleCombined
    : labels.scheduleTitle;

  // The forecast note appears only when the displayed schedule's month 1
  // actually differs from the visible first payment (≥ 1 agora), and never
  // repeats the forecast month-1 amount.
  const displayedFirstDiffers =
    submitted !== null &&
    displayedSchedule.length > 0 &&
    Math.abs(
      displayedSchedule[0].payment -
        (displayedIsCombined
          ? submitted.summary.currentCombinedFirstPayment
          : (submitted.summary.trackSummaries[
              isSingleTrack ? 0 : (selectedTrackIndex ?? 0)
            ]?.forecast?.currentFirstPayment ??
            submitted.summary.trackSummaries[
              isSingleTrack ? 0 : (selectedTrackIndex ?? 0)
            ]?.variableForecast?.currentFirstPayment ??
            submitted.summary.trackSummaries[
              isSingleTrack ? 0 : (selectedTrackIndex ?? 0)
            ]?.cpiForecast?.currentFirstPayment ??
            displayedSchedule[0].payment)),
    ) >= 0.01;
  const scheduleNotes = displayedIsCombined
    ? [
        labels.weightedRateNote,
        ...(scenarioHasForecastTrack && displayedFirstDiffers
          ? [labels.forecastScheduleNote]
          : []),
      ]
    : displayedIsForecast && displayedFirstDiffers
      ? [labels.forecastScheduleNote]
      : [];

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
    submitted !== null && (!isSingleTrack || hasVariableStyleTrack);

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
              fieldErrors={hasError ? validateTrackDraft(draft) : {}}
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
          {submitted && (
            <button
              type="button"
              onClick={scrollToResults}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm text-slate-700 transition hover:bg-slate-100"
            >
              {labels.viewResultsButton} <span aria-hidden>↓</span>
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
          <section id="results" ref={resultsRef} className="mt-6 scroll-mt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-2xl font-bold tracking-tight">
                {labels.combinedResultsTitle}
              </h2>
              <CopyLinkButton
                buttonLabel={labels.copyScenarioLinkButton}
                successText={labels.copyScenarioLinkSuccess}
                fallbackText={labels.copyScenarioLinkFallback}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {combinedResults.map((result) => (
                <div
                  key={result.label}
                  className={`rounded-2xl border p-4 shadow-sm ${
                    result.tone ?? "border-slate-200 bg-white"
                  }`}
                >
                  <div className="text-sm text-slate-500">{result.label}</div>
                  <div className="mt-1 text-xl font-bold text-slate-900">
                    {result.icon && <span aria-hidden>{result.icon} </span>}
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
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {labels.stabilityDisclaimer}
            </p>
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

                  // Prime and variable-unlinked share the forecast row
                  // layout; the visible first payment is ALWAYS the
                  // today's-rate payment (forecast month 1 stays internal).
                  const forecastResults =
                    trackSummary.forecast ??
                    trackSummary.variableForecast ??
                    trackSummary.cpiForecast;
                  const rows =
                    input.type !== "fixedUnlinked" && forecastResults
                      ? [
                          ...commonRows,
                          {
                            label: labels.primeOfferedRateLabel,
                            value: percentFormat.format(
                              input.currentCustomerRatePercent / 100,
                            ),
                          },
                          ...(input.type === "variableGovernmentBond"
                            ? [
                                {
                                  label: labels.resetPeriodLabel,
                                  value:
                                    {
                                      24: labels.resetEvery2Years,
                                      30: labels.resetEvery2HalfYears,
                                      36: labels.resetEvery3Years,
                                      60: labels.resetEvery5Years,
                                      84: labels.resetEvery7Years,
                                      120: labels.resetEvery10Years,
                                    }[input.resetPeriodMonths] ??
                                    String(input.resetPeriodMonths),
                                },
                              ]
                            : []),
                          ...(input.type === "variableMakam" &&
                          trackSummary.variableForecast?.makamAnchorPercent !==
                            undefined
                            ? [
                                {
                                  label: labels.makamAnchorLabel,
                                  value: percentFormat.format(
                                    trackSummary.variableForecast
                                      .makamAnchorPercent / 100,
                                  ),
                                },
                              ]
                            : []),
                          ...(input.type === "fixedLinked" &&
                          trackSummary.cpiForecast
                            ? [
                                {
                                  label: labels.expectedInflationLabel,
                                  value: percentFormat.format(
                                    trackSummary.cpiForecast
                                      .firstYearExpectedInflationPercent / 100,
                                  ),
                                },
                              ]
                            : []),
                          {
                            label: labels.firstMonthlyPaymentLabel,
                            value: currencyFormat.format(
                              forecastResults.currentFirstPayment,
                            ),
                          },
                          {
                            label: labels.forecastMaxPaymentLabel,
                            value: `${currencyFormat.format(
                              forecastResults.forecastMaximumPayment,
                            )} (${formatMaxMonth(
                              forecastResults.monthOfForecastMaximumPayment,
                            )})`,
                          },
                          {
                            label: labels.forecastTotalPaymentLabel,
                            value: currencyFormat.format(
                              forecastResults.forecastTotalPayment,
                            ),
                          },
                          {
                            label: labels.forecastTotalInterestLabel,
                            value: currencyFormat.format(
                              forecastResults.forecastTotalInterest,
                            ),
                          },
                          {
                            label: labels.forecastOverallRateLabel,
                            value: percentFormat.format(
                              forecastResults.forecastOverallRatePercent / 100,
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
                                  label: labels.firstMonthlyPaymentLabel,
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
                          {
                            {
                              prime: labels.trackTypePrime,
                              variableGovernmentBond:
                                labels.trackTypeGovernmentBond,
                              variableMakam: labels.trackTypeMakam,
                              fixedLinked: labels.trackTypeFixedLinked,
                              fixedUnlinked: labels.trackTypeFixedUnlinked,
                            }[input.type]
                          }
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
                      <div className="mt-2 border-t border-slate-100 pt-2">
                        <div className="text-xs font-medium text-slate-700">
                          {labels.stabilityTrackLabel}:{" "}
                          <StabilityBadge
                            score={trackStabilityScore(
                              stabilityKeyForTrackType(input.type),
                            )}
                          />
                        </div>
                        <p className="mt-0.5 text-xs leading-5 text-slate-500">
                          {labels.stabilityDimensionsHelp}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* The schedule is always visible right after the results — there
              is no meaningful content below it, so nothing is collapsed. */}
          <AmortizationSchedule
            // Remount on a new calculation or view switch so scroll resets.
            key={`${selectedScheduleId}-${submitted.summary.numberOfPayments}-${submitted.summary.monthlyPayment}-${submitted.summary.totalInterest}`}
            schedule={displayedSchedule}
            labels={labels}
            locale={locale}
            title={scheduleTitle}
            rateColumnHeader={
              displayedIsCombined
                ? labels.weightedRateHeader
                : labels.rateHeader
            }
            notes={scheduleNotes}
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

      {/* Compact, audit-friendly freshness of every external data source.
          Each card keeps the observation period, publication/effective
          dates, and check time as SEPARATE, human-formatted facts — never
          a raw ISO timestamp. */}
      <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <summary className="cursor-pointer text-xs font-medium text-slate-600">
          {labels.freshnessTitle}
        </summary>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {labels.freshnessIntro}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <FreshnessCard
            title={labels.freshnessBoiRate}
            rows={[
              {
                label: labels.freshnessValue,
                value: `${marketData.boiRatePercent}%`,
              },
              {
                label: labels.freshnessEffective,
                value: formatDateOnly(marketData.boiRateEffectiveDate, locale),
              },
              {
                label: labels.freshnessNextDecision,
                value: formatDateOnly(marketData.boiNextDecisionAt, locale),
              },
              {
                label: labels.freshnessChecked,
                value: formatDateTimeIsrael(marketData.marketFetchedAt, locale),
              },
              {
                label: labels.freshnessStatusLabel,
                value: freshnessStatusText(marketData.boiRateStatus, labels),
              },
            ]}
          />
          {marketData.curves.map((curve, index) => {
            const role = classifyCurveFreshnessRole(
              curve.id,
              index,
              drafts,
              market,
            );
            const title =
              role === "used"
                ? labels.freshnessCurveUsed
                : role === "latest"
                  ? labels.freshnessCurveLatest
                  : labels.freshnessCurvePinned;
            return (
              <FreshnessCard
                key={curve.id}
                title={title}
                rows={[
                  {
                    label: labels.freshnessReference,
                    value: curveReferenceLabel(
                      curve as MortgageForecastCurveSnapshot,
                    ),
                  },
                  {
                    label: labels.freshnessPublished,
                    value: formatDateOnly(curve.publicationDate, locale),
                  },
                  {
                    label: labels.freshnessEffective,
                    value: formatDateOnly(curve.effectiveDate, locale),
                  },
                  {
                    label: labels.freshnessChecked,
                    value: formatDateTimeIsrael(curve.fetchedAt, locale),
                  },
                  {
                    label: labels.freshnessStatusLabel,
                    value: freshnessStatusText(curve.status, labels),
                  },
                ]}
                technicalTitle={labels.freshnessTechnicalDetails}
                technical={[{ label: labels.freshnessId, value: curve.id }]}
              />
            );
          })}
          {marketData.makamSnapshots.map((snapshot) => (
            <FreshnessCard
              key={snapshot.id}
              title={labels.freshnessMakam}
              rows={[
                {
                  label: labels.freshnessReference,
                  value: monthYearFormat.format(
                    new Date(
                      Date.UTC(
                        snapshot.referenceYear,
                        snapshot.referenceMonth - 1,
                        1,
                      ),
                    ),
                  ),
                },
                {
                  label: labels.freshnessValue,
                  value: `${Math.round(snapshot.anchorPercent * 10000) / 10000}%`,
                },
                {
                  label: labels.freshnessSource,
                  value: sourceDisplayName(snapshot.sourceId),
                },
                {
                  label: labels.freshnessChecked,
                  value: formatDateTimeIsrael(snapshot.fetchedAt, locale),
                },
                {
                  label: labels.freshnessStatusLabel,
                  value: freshnessStatusText(snapshot.status, labels),
                },
              ]}
            />
          ))}
        </div>
      </details>

      <p className="mt-3 text-sm leading-6 text-slate-500">
        {labels.disclaimer}
      </p>
    </div>
  );
}
