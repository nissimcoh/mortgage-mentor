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
    <div className="relative glass-panel rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="absolute end-2 top-2 z-10">
        <ScenarioActionsMenu id={id} currentName={name} labels={labels} />
      </div>

      <Link
        href={`/${locale}/saved/${id}`}
        className="block rounded-2xl p-4 pe-14 transition hover:bg-slate-50"
      >
        <h3 className="text-base font-bold text-slate-900">{name}</h3>

        {resultSnapshot ? (
          <>
            <p className="mt-2 text-xs text-slate-500">
              {labels.cardAmountLabel}
            </p>
            <p className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
              {currencyFormat.format(resultSnapshot.totalPrincipal)}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {labels.cardFirstPaymentLabel}{" "}
              <span className="tabular-nums">
                {currencyFormat.format(resultSnapshot.firstPayment)}
              </span>
            </p>
            <span
              className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${STABILITY_BADGE_CLASS[stabilityColorState(resultSnapshot.stabilityScore)]}`}
            >
              {labels.cardStabilityLabel}{" "}
              {Math.round(resultSnapshot.stabilityScore)}/100
            </span>
          </>
        ) : (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {labels.invalidScenarioMessage}
          </p>
        )}

        <p className="mt-3 text-xs text-slate-400">
          {labels.cardUpdatedLabel} {formatDateOnly(updatedAt, locale)}
        </p>
      </Link>
    </div>
  );
}
