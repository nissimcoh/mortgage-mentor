"use client";

// Type-only import: erased at compile time, keeps the server-only
// dictionary module out of the client bundle.
import type { Dictionary } from "@/app/[locale]/dictionaries";
import {
  MAX_YEARS,
  MIN_YEARS,
  SUPPORTED_TRACK_TYPE,
  type TrackDraft,
} from "@/lib/mortgage/scenario-form";

type CalculatorLabels = Dictionary["calculator"];

const DURATION_YEARS = Array.from(
  { length: MAX_YEARS - MIN_YEARS + 1 },
  (_, index) => MIN_YEARS + index,
);

interface MortgageTrackCardProps {
  index: number;
  draft: TrackDraft;
  labels: CalculatorLabels;
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
  canRemove,
  canDuplicate,
  onChange,
  onAmountBlur,
  onRemove,
  onDuplicate,
}: MortgageTrackCardProps) {
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
            <option value={SUPPORTED_TRACK_TYPE}>
              {labels.trackTypeFixedUnlinked}
            </option>
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
          <span className={labelClass}>{labels.interestRateLabel}</span>
          <span className="relative block">
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={draft.ratePercent}
              onChange={(event) => onChange("ratePercent", event.target.value)}
              className={`${fieldClass} pe-9`}
            />
            <span aria-hidden className={unitClass}>
              %
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}
