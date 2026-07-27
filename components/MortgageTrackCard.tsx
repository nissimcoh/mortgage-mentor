"use client";

// Type-only import: erased at compile time, keeps the server-only
// dictionary module out of the client bundle.
import type { Dictionary } from "@/app/[locale]/dictionaries";
import {
  MAX_YEARS,
  MIN_YEARS,
  type TrackDraft,
} from "@/lib/mortgage/scenario-form";
import {
  GOVERNMENT_BOND_RESET_MONTHS,
  GOVERNMENT_BOND_TERM_YEARS,
  isGovernmentBondResetMonths,
  MAKAM_TERM_YEARS,
} from "@/lib/mortgage/product-catalog";
import { parseDecimalRate } from "@/lib/forms/numeric";

type CalculatorLabels = Dictionary["calculator"];

const DURATION_YEARS = Array.from(
  { length: MAX_YEARS - MIN_YEARS + 1 },
  (_, index) => MIN_YEARS + index,
);

/** Serializable market context the card needs for its info lines. */
export interface TrackCardMarketInfo {
  boiRatePercent: number;
  primeRatePercent: number;
  /** e.g. "יוני 2026 · קלנדרי" — formatted by the parent. */
  curveReferenceLabel: string;
  curveIsFallback: boolean;
  /** The draft pins a curve ID that is not available. */
  curveIsMissing: boolean;
  /** Makam tracks: formatted anchor line, e.g. "3.26% (יוני 2026)". */
  makamAnchorLabel: string | null;
  /** The draft pins a Makam snapshot ID that is not available. */
  makamAnchorIsMissing: boolean;
  /** Fixed CPI-linked tracks: formatted expected first-year inflation. */
  expectedInflationLabel: string | null;
}

interface MortgageTrackCardProps {
  index: number;
  draft: TrackDraft;
  labels: CalculatorLabels;
  market: TrackCardMarketInfo;
  canRemove: boolean;
  canDuplicate: boolean;
  onChange: (field: keyof Omit<TrackDraft, "id">, value: string) => void;
  onAmountBlur: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
}

const labelClass = "mb-1 block text-sm font-medium text-slate-700";
const fieldClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";
const unitClass =
  "pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-slate-400";
const actionClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100";

function resetFrequencyLabel(
  labels: CalculatorLabels,
  months: number,
): string {
  switch (months) {
    case 24:
      return labels.resetEvery2Years;
    case 30:
      return labels.resetEvery2HalfYears;
    case 36:
      return labels.resetEvery3Years;
    case 60:
      return labels.resetEvery5Years;
    case 84:
      return labels.resetEvery7Years;
    case 120:
      return labels.resetEvery10Years;
    default:
      return String(months);
  }
}

/** One editable mortgage track. Purely presentational: state lives in the parent. */
export default function MortgageTrackCard({
  index,
  draft,
  labels,
  market,
  canRemove,
  canDuplicate,
  onChange,
  onAmountBlur,
  onRemove,
  onDuplicate,
}: MortgageTrackCardProps) {
  const isPrime = draft.trackType === "prime";
  const isGovernmentBond = draft.trackType === "variableGovernmentBond";
  const isMakam = draft.trackType === "variableMakam";
  const isFixedLinked = draft.trackType === "fixedLinked";
  // Tracks whose forecast comes from the official curve workbook.
  const isVariableStyle = isPrime || isGovernmentBond || isMakam || isFixedLinked;
  // Preset products verified as Spitzer-only: no repayment selector.
  const isSpitzerPreset = isGovernmentBond || isMakam || isFixedLinked;

  const governmentBondReset = Number(draft.resetPeriodMonths);
  const governmentBondTerms = isGovernmentBondResetMonths(governmentBondReset)
    ? GOVERNMENT_BOND_TERM_YEARS[governmentBondReset]
    : null;

  const enteredRate = isPrime
    ? parseDecimalRate(draft.currentRatePercent)
    : null;
  const marginText =
    enteredRate === null
      ? null
      : `P${enteredRate - market.primeRatePercent >= 0 ? "+" : "−"}${Math.abs(
          Math.round((enteredRate - market.primeRatePercent) * 100) / 100,
        )}`;

  const amountField = (
    <label className="block">
      <span className={labelClass}>{labels.trackAmountLabel}</span>
      <span className="relative block">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          value={draft.amount}
          onChange={(event) => onChange("amount", event.target.value)}
          onBlur={onAmountBlur}
          className={`${fieldClass} pe-9`}
        />
        <span aria-hidden className={unitClass}>
          ₪
        </span>
      </span>
    </label>
  );

  const typeField = (
    <label className="block">
      <span className={labelClass}>{labels.trackTypeLabel}</span>
      <select
        value={draft.trackType}
        onChange={(event) => onChange("trackType", event.target.value)}
        className={fieldClass}
      >
        <option value="fixedUnlinked">{labels.trackTypeFixedUnlinked}</option>
        <option value="prime">{labels.trackTypePrime}</option>
        <option value="variableGovernmentBond">
          {labels.trackTypeGovernmentBond}
        </option>
        <option value="variableMakam">{labels.trackTypeMakam}</option>
        <option value="fixedLinked">{labels.trackTypeFixedLinked}</option>
      </select>
    </label>
  );

  const rateField = (
    <label className="block">
      <span className={labelClass}>
        {isVariableStyle
          ? labels.primeOfferedRateLabel
          : labels.interestRateLabel}
      </span>
      <span className="relative block">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={isVariableStyle ? draft.currentRatePercent : draft.ratePercent}
          onChange={(event) =>
            onChange(
              isVariableStyle ? "currentRatePercent" : "ratePercent",
              event.target.value,
            )
          }
          className={`${fieldClass} pe-9`}
        />
        <span aria-hidden className={unitClass}>
          %
        </span>
      </span>
    </label>
  );

  // The repayment-method area keeps the same shape for every track type so
  // switching products doesn't make the form jump. Spitzer-only presets
  // render it as a single-option disabled select instead of removing it.
  const methodField = isSpitzerPreset ? (
    <label className="block">
      <span className={labelClass}>{labels.repaymentMethodLabel}</span>
      <select
        value="spitzer"
        disabled
        aria-readonly="true"
        className={fieldClass}
      >
        <option value="spitzer">{labels.repaymentMethodSpitzer}</option>
      </select>
    </label>
  ) : (
    <label className="block">
      <span className={labelClass}>{labels.repaymentMethodLabel}</span>
      <select
        value={draft.repaymentMethod}
        onChange={(event) => onChange("repaymentMethod", event.target.value)}
        className={fieldClass}
      >
        <option value="spitzer">{labels.repaymentMethodSpitzer}</option>
        <option value="equalPrincipal">
          {labels.repaymentMethodEqualPrincipal}
        </option>
      </select>
    </label>
  );

  // Term options depend on the product: full catalog per gov-bond reset
  // frequency, whole 4-30 years for Makam, whole 1-30 years otherwise.
  const termOptions = isGovernmentBond
    ? (governmentBondTerms ?? [])
    : isMakam
      ? MAKAM_TERM_YEARS
      : DURATION_YEARS;
  const termDisabled = isGovernmentBond && governmentBondTerms === null;
  const termField = (
    <label className="block">
      <span className={labelClass}>{labels.yearsLabel}</span>
      <select
        value={draft.years}
        disabled={termDisabled}
        onChange={(event) => onChange("years", event.target.value)}
        className={fieldClass}
      >
        <option value="" disabled>
          {termDisabled
            ? labels.selectFrequencyFirst
            : labels.yearsSelectPlaceholder}
        </option>
        {!termDisabled &&
          termOptions.map((years) => (
            <option key={years} value={String(years)}>
              {years === 1
                ? labels.yearSingular
                : `${years} ${labels.yearsPlural}`}
            </option>
          ))}
      </select>
    </label>
  );

  // Single-choice segmented control (radio group) for the reset frequency.
  const frequencyField = (
    <div>
      <span className={labelClass}>{labels.resetPeriodLabel}</span>
      <div
        role="radiogroup"
        aria-label={labels.resetPeriodLabel}
        className="flex flex-wrap gap-1.5"
      >
        {GOVERNMENT_BOND_RESET_MONTHS.map((months) => {
          const selected = draft.resetPeriodMonths === String(months);
          return (
            <button
              key={months}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange("resetPeriodMonths", String(months))}
              className={`rounded-full px-3 py-1.5 text-xs transition ${
                selected
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {resetFrequencyLabel(labels, months)}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">
          {labels.trackLabel} {index + 1}
        </h3>
        <div className="flex gap-2">
          {canDuplicate && (
            <button type="button" onClick={onDuplicate} className={actionClass}>
              {labels.duplicateTrack}
            </button>
          )}
          {canRemove && (
            <button type="button" onClick={onRemove} className={actionClass}>
              {labels.removeTrack}
            </button>
          )}
        </div>
      </div>

      {isGovernmentBond ? (
        // Required interaction order: amount → type → rate → frequency → term.
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {amountField}
            {typeField}
            {rateField}
          </div>
          {frequencyField}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {termField}
            {methodField}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1.3fr_1fr_1fr_1fr_1fr]">
          {amountField}
          {typeField}
          {methodField}
          {termField}
          {rateField}
        </div>
      )}

      {isVariableStyle && (
        <>
          {market.curveIsMissing && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs leading-5 text-amber-800">
                {labels.curveUnavailableNote}
              </p>
              <button
                type="button"
                onClick={() => onChange("forecastCurveId", "")}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-800 transition hover:bg-amber-100"
              >
                {labels.useLatestCurveButton}
              </button>
            </div>
          )}
          {isMakam && market.makamAnchorIsMissing && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs leading-5 text-amber-800">
                {labels.makamAnchorUnavailableNote}
              </p>
              <button
                type="button"
                onClick={() => onChange("makamSnapshotId", "")}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-800 transition hover:bg-amber-100"
              >
                {labels.useLatestMakamButton}
              </button>
            </div>
          )}
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {isPrime && (
              <>
                {labels.primeInfoBoi}: {market.boiRatePercent}% ·{" "}
                {labels.primeInfoPrime}: {market.primeRatePercent}%
                {marginText && (
                  <>
                    {" · "}
                    {labels.primeInfoMargin}: {marginText}
                  </>
                )}
                {" · "}
              </>
            )}
            {isGovernmentBond && <>{labels.governmentBondHelp} · </>}
            {isMakam && (
              <>
                {labels.makamHelp}
                {market.makamAnchorLabel && (
                  <>
                    {" · "}
                    {labels.makamAnchorLabel}: {market.makamAnchorLabel}
                  </>
                )}
                {" · "}
              </>
            )}
            {isFixedLinked && (
              <>
                {labels.fixedLinkedHelp}
                {market.expectedInflationLabel && (
                  <>
                    {" · "}
                    {labels.expectedInflationLabel}:{" "}
                    {market.expectedInflationLabel}
                  </>
                )}
                {" · "}
              </>
            )}
            {labels.primeInfoCurve}: {market.curveReferenceLabel}
            {market.curveIsFallback && (
              <span className="text-amber-700">
                {" "}
                ({labels.primeForecastFallbackNote})
              </span>
            )}
          </p>

          <details className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-slate-600">
              {labels.advancedTitle}
            </summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>
                  {isFixedLinked
                    ? labels.inflationModeLabel
                    : labels.forecastModeLabel}
                </span>
                <select
                  value={draft.forecastMode}
                  onChange={(event) =>
                    onChange("forecastMode", event.target.value)
                  }
                  className={fieldClass}
                >
                  <option value="official">
                    {isFixedLinked
                      ? labels.inflationModeOfficial
                      : labels.forecastModeOfficial}
                  </option>
                  <option value="constant">
                    {isFixedLinked
                      ? labels.inflationModeConstant
                      : labels.forecastModeConstant}
                  </option>
                  <option value="stress">
                    {isFixedLinked
                      ? labels.inflationModeStress
                      : labels.forecastModeStress}
                  </option>
                </select>
              </label>
              {draft.forecastMode === "stress" && (
                <label className="block">
                  <span className={labelClass}>
                    {isFixedLinked
                      ? labels.inflationStressShiftLabel
                      : labels.stressShiftLabel}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="+1"
                    value={
                      isFixedLinked
                        ? draft.inflationStressShift
                        : draft.stressShift
                    }
                    onChange={(event) =>
                      onChange(
                        isFixedLinked ? "inflationStressShift" : "stressShift",
                        event.target.value,
                      )
                    }
                    className={fieldClass}
                  />
                </label>
              )}
            </div>
            {draft.forecastMode !== "official" && (
              <p className="mt-2 text-xs text-amber-700">
                {labels.stressScenarioNote}
              </p>
            )}
            {draft.forecastMode === "stress" && !isFixedLinked && (
              <p className="mt-1 text-xs text-slate-500">
                {labels.negativeRatesNote}
              </p>
            )}
          </details>
        </>
      )}
    </div>
  );
}
