"use client";

// Type-only import: erased at compile time, keeps the server-only
// dictionary module out of the client bundle.
import type { Dictionary } from "@/app/[locale]/dictionaries";
import {
  MAX_YEARS,
  MIN_YEARS,
  type TrackDraft,
} from "@/lib/mortgage/scenario-form";
import { parseDecimalRate } from "@/lib/forms/numeric";

type CalculatorLabels = Dictionary["calculator"];

const DURATION_YEARS = Array.from(
  { length: MAX_YEARS - MIN_YEARS + 1 },
  (_, index) => MIN_YEARS + index,
);

/** Serializable market context the card needs for the prime info line. */
export interface TrackCardMarketInfo {
  boiRatePercent: number;
  primeRatePercent: number;
  /** e.g. "יוני 2026 · קלנדרי" — formatted by the parent. */
  curveReferenceLabel: string;
  curveIsFallback: boolean;
  /** The draft pins a curve ID that is not available. */
  curveIsMissing: boolean;
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
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500";
const unitClass =
  "pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-slate-400";
const actionClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100";

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

  const enteredRate = isPrime
    ? parseDecimalRate(draft.currentRatePercent)
    : null;
  const marginText =
    enteredRate === null
      ? null
      : `P${enteredRate - market.primeRatePercent >= 0 ? "+" : "−"}${Math.abs(
          Math.round((enteredRate - market.primeRatePercent) * 100) / 100,
        )}`;

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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1.3fr_1fr_1fr_1fr_1fr]">
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

        <label className="block">
          <span className={labelClass}>{labels.trackTypeLabel}</span>
          <select
            value={draft.trackType}
            onChange={(event) => onChange("trackType", event.target.value)}
            className={fieldClass}
          >
            <option value="fixedUnlinked">
              {labels.trackTypeFixedUnlinked}
            </option>
            <option value="prime">{labels.trackTypePrime}</option>
          </select>
        </label>

        <label className="block">
          <span className={labelClass}>{labels.repaymentMethodLabel}</span>
          <select
            value={draft.repaymentMethod}
            onChange={(event) =>
              onChange("repaymentMethod", event.target.value)
            }
            className={fieldClass}
          >
            <option value="spitzer">{labels.repaymentMethodSpitzer}</option>
            <option value="equalPrincipal">
              {labels.repaymentMethodEqualPrincipal}
            </option>
          </select>
        </label>

        <label className="block">
          <span className={labelClass}>{labels.yearsLabel}</span>
          <select
            value={draft.years}
            onChange={(event) => onChange("years", event.target.value)}
            className={fieldClass}
          >
            <option value="" disabled>
              {labels.yearsSelectPlaceholder}
            </option>
            {DURATION_YEARS.map((years) => (
              <option key={years} value={String(years)}>
                {years === 1
                  ? labels.yearSingular
                  : `${years} ${labels.yearsPlural}`}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClass}>
            {isPrime ? labels.primeOfferedRateLabel : labels.interestRateLabel}
          </span>
          <span className="relative block">
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={isPrime ? draft.currentRatePercent : draft.ratePercent}
              onChange={(event) =>
                onChange(
                  isPrime ? "currentRatePercent" : "ratePercent",
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
      </div>

      {isPrime && (
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
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {labels.primeInfoBoi}: {market.boiRatePercent}% ·{" "}
            {labels.primeInfoPrime}: {market.primeRatePercent}%
            {marginText && (
              <>
                {" · "}
                {labels.primeInfoMargin}: {marginText}
              </>
            )}
            {" · "}
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
                <span className={labelClass}>{labels.forecastModeLabel}</span>
                <select
                  value={draft.forecastMode}
                  onChange={(event) =>
                    onChange("forecastMode", event.target.value)
                  }
                  className={fieldClass}
                >
                  <option value="official">{labels.forecastModeOfficial}</option>
                  <option value="constant">{labels.forecastModeConstant}</option>
                  <option value="stress">{labels.forecastModeStress}</option>
                </select>
              </label>
              {draft.forecastMode === "stress" && (
                <label className="block">
                  <span className={labelClass}>{labels.stressShiftLabel}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="+1"
                    value={draft.stressShift}
                    onChange={(event) =>
                      onChange("stressShift", event.target.value)
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
            {draft.forecastMode === "stress" && (
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
