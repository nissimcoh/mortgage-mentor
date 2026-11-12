import Link from "next/link";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import { formatDateOnly } from "@/lib/forms/dates";
import type { Locale } from "@/lib/i18n/config";
import { stabilityColorState } from "@/lib/mortgage/stability";
import type { StoredScenarioResultSnapshot } from "@/lib/scenarios/contract";
import ScenarioActionsMenu from "./ScenarioActionsMenu";

const STABILITY_BADGE_CLASS = {
  stable: "border-emerald-200 bg-emerald-50 text-emerald-800",
  moderate: "border-amber-200 bg-amber-50 text-amber-800",
  unstable: "border-red-200 bg-red-50 text-red-800",
} as const;

interface ScenarioCardProps {
  id: string;
  name: string;
  updatedAt: string;
  locale: Locale;
  /** Null when the stored row failed validation — shown as an inline
   * error instead of numbers that might not mean what they claim to. */
  resultSnapshot: StoredScenarioResultSnapshot | null;
  labels: Dictionary["savedPage"];
}

/**
 * The card's main area is a single link into the scenario's detail page
 * (`/saved/{id}`) — this list is no longer primarily a shortcut into the
 * calculator. The overflow menu (Rename/Duplicate/Delete) is a separate
 * sibling, absolutely positioned in the corner, so it never nests an
 * interactive button inside the card's own anchor.
 */
export default function ScenarioCard({
  id,
  name,
  updatedAt,
  locale,
  resultSnapshot,
  labels,
}: ScenarioCardProps) {
  const intlLocale = locale === "he" ? "he-IL" : "en-US";
  const currencyFormat = new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  });

  return (
    <div className="glass-panel lift relative">
      <div className="absolute end-3 top-3 z-10">
        <ScenarioActionsMenu id={id} currentName={name} labels={labels} />
      </div>

      <Link
        href={`/${locale}/saved/${id}`}
        className="flex h-full flex-col rounded-3xl p-5 pe-14 sm:p-6 sm:pe-14"
      >
        <h3 className="break-words text-lg font-semibold tracking-tight text-slate-900">{name}</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          {labels.cardUpdatedLabel} {formatDateOnly(updatedAt, locale)}
        </p>

        {resultSnapshot ? (
          <>
            {/* The two figures people compare first: what it costs each
                month, and how much was borrowed. */}
            <dl className="-me-9 mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <dt className="text-xs text-slate-500">{labels.cardFirstPaymentLabel}</dt>
                <dd className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  <bdi>{currencyFormat.format(resultSnapshot.firstPayment)}</bdi>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">{labels.cardAmountLabel}</dt>
                <dd className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  <bdi>{currencyFormat.format(resultSnapshot.totalPrincipal)}</bdi>
                </dd>
              </div>
            </dl>
            <p className="-me-9 mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-black/[.06] pt-4 text-xs text-slate-500">
              <span
                className={`inline-block rounded-full border px-2 py-0.5 font-medium ${STABILITY_BADGE_CLASS[stabilityColorState(resultSnapshot.stabilityScore)]}`}
              >
                {labels.cardStabilityLabel}{" "}
                {Math.round(resultSnapshot.stabilityScore)}/100
              </span>
              <span>
                {labels.cardHighestPaymentLabel}{" "}
                <bdi className="tabular-nums text-slate-700">{currencyFormat.format(resultSnapshot.highestPayment)}</bdi>
              </span>
              <span>
                {labels.cardTrackCountLabel}{" "}
                <span className="tabular-nums text-slate-700">{resultSnapshot.trackCount}</span>
              </span>
            </p>
          </>
        ) : (
          // Static server-rendered state, not a live event: no role="alert".
          <p className="mt-3 text-sm text-red-600">
            {labels.invalidScenarioMessage}
          </p>
        )}
      </Link>
    </div>
  );
}
