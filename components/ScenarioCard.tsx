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
  /** Null when input_payload couldn't be parsed — Open is hidden. */
  openHref: string | null;
  labels: Dictionary["savedPage"];
}

export default function ScenarioCard({
  id,
  name,
  updatedAt,
  locale,
  resultSnapshot,
  openHref,
  labels,
}: ScenarioCardProps) {
  const intlLocale = locale === "he" ? "he-IL" : "en-US";
  const currencyFormat = new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-base font-bold text-slate-900">{name}</h3>
        <span className="shrink-0 text-xs text-slate-400">
          {labels.cardUpdatedLabel} {formatDateOnly(updatedAt, locale)}
        </span>
      </div>

      {resultSnapshot ? (
        <>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <div>
              <dt className="text-slate-500">{labels.cardAmountLabel}</dt>
              <dd className="font-medium text-slate-900">
                {currencyFormat.format(resultSnapshot.totalPrincipal)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{labels.cardTrackCountLabel}</dt>
              <dd className="font-medium text-slate-900">
                {resultSnapshot.trackCount}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{labels.cardFirstPaymentLabel}</dt>
              <dd className="font-medium text-slate-900">
                {currencyFormat.format(resultSnapshot.firstPayment)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{labels.cardHighestPaymentLabel}</dt>
              <dd className="font-medium text-slate-900">
                {currencyFormat.format(resultSnapshot.highestPayment)}
              </dd>
            </div>
          </dl>

          <span
            className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${STABILITY_BADGE_CLASS[stabilityColorState(resultSnapshot.stabilityScore)]}`}
          >
            {labels.cardStabilityLabel} {Math.round(resultSnapshot.stabilityScore)}/100
          </span>
        </>
      ) : (
        <p role="alert" className="text-sm text-red-600">
          {labels.invalidScenarioMessage}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {openHref ? (
          <Link
            href={openHref}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white transition hover:bg-slate-700"
          >
            {labels.openButton}
          </Link>
        ) : (
          <span />
        )}
        <ScenarioActionsMenu id={id} currentName={name} labels={labels} />
      </div>
    </div>
  );
}
