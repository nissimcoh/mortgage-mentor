import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import {
  parseDecimalRate,
  parseSignedDecimal,
  parseWholeAmount,
} from "@/lib/forms/numeric";
import { formatDateOnly } from "@/lib/forms/dates";
import { isValidLocale, type Locale } from "@/lib/i18n/config";
import { paymentMonthParts, stabilityLevel } from "@/lib/mortgage";
import {
  applyTracksToQuery,
  type TrackDraft,
} from "@/lib/mortgage/scenario-form";
import {
  isUuidLike,
  isValidResultSnapshot,
  validateInputPayload,
} from "@/lib/scenarios/payload";
import { createClient } from "@/lib/supabase/server";
import StabilityMeter from "@/components/StabilityMeter";
import { getDictionary } from "../../dictionaries";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; scenarioId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getDictionary(locale);
  // Deliberately generic (not the scenario's own name) — keeps a
  // per-user, auth-protected page's title from leaking into browser
  // history/tab titles.
  return {
    title: `${dict.nav.saved} | MortgageMentor`,
    description: dict.scenarioDetailPage.snapshotNote,
  };
}

/** Shared shell for the not-found / load-error / invalid-data states —
 * all three are "can't show the real page" cases and share one layout. */
function StatusMessage({
  locale,
  backLabel,
  title,
  body,
}: {
  locale: Locale;
  backLabel: string;
  title: string;
  body: string;
}) {
  return (
    <main className="bg-slate-50 text-slate-900">
      <section className="mx-auto max-w-2xl px-6 pt-10 pb-16 sm:pt-12">
        <Link
          href={`/${locale}/saved`}
          className="text-sm text-slate-500 transition hover:text-slate-800"
        >
          {backLabel}
        </Link>
        <h1 className="mt-3 mb-2 text-2xl font-bold tracking-tight">
          {title}
        </h1>
        <p className="mt-1 text-base leading-7 text-slate-600">{body}</p>
      </section>
    </main>
  );
}

function trackTypeLabel(
  trackType: string,
  labels: Dictionary["calculator"],
): string {
  switch (trackType) {
    case "fixedUnlinked":
      return labels.trackTypeFixedUnlinked;
    case "prime":
      return labels.trackTypePrime;
    case "variableGovernmentBond":
      return labels.trackTypeGovernmentBond;
    case "variableMakam":
      return labels.trackTypeMakam;
    case "fixedLinked":
      return labels.trackTypeFixedLinked;
    default:
      return trackType;
  }
}

const RESET_PERIOD_LABEL_KEY: Record<
  string,
  keyof Pick<
    Dictionary["calculator"],
    | "resetEvery2Years"
    | "resetEvery2HalfYears"
    | "resetEvery3Years"
    | "resetEvery5Years"
    | "resetEvery7Years"
    | "resetEvery10Years"
  >
> = {
  "24": "resetEvery2Years",
  "30": "resetEvery2HalfYears",
  "36": "resetEvery3Years",
  "60": "resetEvery5Years",
  "84": "resetEvery7Years",
  "120": "resetEvery10Years",
};

function forecastOrInflationModeLabel(
  mode: string,
  labels: Dictionary["calculator"],
  isInflation: boolean,
): string | null {
  const table = isInflation
    ? {
        official: labels.inflationModeOfficial,
        constant: labels.inflationModeConstant,
        stress: labels.inflationModeStress,
      }
    : {
        official: labels.forecastModeOfficial,
        constant: labels.forecastModeConstant,
        stress: labels.forecastModeStress,
      };
  return (table as Record<string, string | undefined>)[mode] ?? null;
}

interface TrackRow {
  label: string;
  value: string;
}

/**
 * Human-readable rows for one stored TrackDraft — reads only what was
 * actually saved (input_payload), never recomputes a forecast/payment.
 * Every field is parsed defensively; a value that doesn't parse falls
 * back to the raw stored string rather than hiding the row or crashing.
 */
function trackRows(
  track: TrackDraft,
  labels: Dictionary["calculator"],
  wholeCurrencyFormat: Intl.NumberFormat,
  percentFormat: Intl.NumberFormat,
  numberFormat: Intl.NumberFormat,
): TrackRow[] {
  const isVariableStyle = track.trackType !== "fixedUnlinked";
  const isInflation = track.trackType === "fixedLinked";

  const amountValue = parseWholeAmount(track.amount);
  const rows: TrackRow[] = [
    {
      label: labels.trackAmountLabel,
      value:
        amountValue !== null
          ? wholeCurrencyFormat.format(amountValue)
          : track.amount || "—",
    },
  ];

  const years = Number(track.years);
  if (track.years !== "" && Number.isFinite(years)) {
    rows.push({
      label: labels.yearsLabel,
      value:
        years === 1
          ? labels.yearSingular
          : `${numberFormat.format(years)} ${labels.yearsPlural}`,
    });
  }

  const rateRaw = isVariableStyle ? track.currentRatePercent : track.ratePercent;
  const rateValue = parseDecimalRate(rateRaw);
  rows.push({
    label: isVariableStyle ? labels.primeOfferedRateLabel : labels.interestRateLabel,
    value: rateValue !== null ? percentFormat.format(rateValue / 100) : rateRaw || "—",
  });

  rows.push({
    label: labels.repaymentMethodLabel,
    value:
      track.repaymentMethod === "equalPrincipal"
        ? labels.repaymentMethodEqualPrincipal
        : labels.repaymentMethodSpitzer,
  });

  if (track.trackType === "variableGovernmentBond") {
    const resetKey = RESET_PERIOD_LABEL_KEY[track.resetPeriodMonths];
    rows.push({
      label: labels.resetPeriodLabel,
      value: resetKey ? labels[resetKey] : track.resetPeriodMonths || "—",
    });
  }

  if (isVariableStyle) {
    const modeLabel = forecastOrInflationModeLabel(
      track.forecastMode,
      labels,
      isInflation,
    );
    if (modeLabel) {
      rows.push({
        label: isInflation ? labels.inflationModeLabel : labels.forecastModeLabel,
        value: modeLabel,
      });
    }
    if (track.forecastMode === "stress") {
      const shiftRaw = isInflation ? track.inflationStressShift : track.stressShift;
      // The stored value is already signed exactly as the user typed it
      // (e.g. "+1" or "-0.5") — parseSignedDecimal only gates whether the
      // row is worth showing at all, the raw string is what's displayed.
      if (parseSignedDecimal(shiftRaw) !== null) {
        rows.push({
          label: isInflation ? labels.inflationStressShiftLabel : labels.stressShiftLabel,
          value: shiftRaw,
        });
      }
    }
  }

  return rows;
}

export default async function ScenarioDetailPage({
  params,
}: {
  params: Promise<{ locale: string; scenarioId: string }>;
}) {
  const { locale, scenarioId } = await params;
  if (!isValidLocale(locale)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/${locale}/signin?next=${encodeURIComponent(`/${locale}/saved/${scenarioId}`)}`,
    );
  }

  const dict = await getDictionary(locale);

  // A syntactically malformed id can never match a real row — treat it
  // the same as "not found" instead of sending it to a uuid-typed column
  // and risking a raw Postgres type error.
  if (!isUuidLike(scenarioId)) {
    return (
      <StatusMessage
        locale={locale}
        backLabel={dict.scenarioDetailPage.backToSavedLabel}
        title={dict.scenarioDetailPage.notFoundTitle}
        body={dict.savedPage.notFoundMessage}
      />
    );
  }

  // RLS's "select own scenarios" policy is the real ownership boundary;
  // .eq("user_id", ...) is the normal, expected app-level filter on top
  // of it. Whether the row doesn't exist or belongs to someone else, the
  // result is identically an empty read — never distinguished to the user.
  const { data: row, error } = await supabase
    .from("mortgage_scenarios")
    .select(
      "id, name, input_payload, result_snapshot, calculated_at, updated_at",
    )
    .eq("id", scenarioId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[saved detail] failed to load scenario:", {
      code: error.code,
      message: error.message,
      hint: error.hint,
    });
    return (
      <StatusMessage
        locale={locale}
        backLabel={dict.scenarioDetailPage.backToSavedLabel}
        title={dict.scenarioDetailPage.notFoundTitle}
        body={dict.savedPage.loadErrorMessage}
      />
    );
  }

  if (!row) {
    return (
      <StatusMessage
        locale={locale}
        backLabel={dict.scenarioDetailPage.backToSavedLabel}
        title={dict.scenarioDetailPage.notFoundTitle}
        body={dict.savedPage.notFoundMessage}
      />
    );
  }

  const payload = validateInputPayload(row.input_payload);
  const resultSnapshot = isValidResultSnapshot(row.result_snapshot)
    ? row.result_snapshot
    : null;

  if (!payload || !resultSnapshot) {
    return (
      <StatusMessage
        locale={locale}
        backLabel={dict.scenarioDetailPage.backToSavedLabel}
        title={dict.scenarioDetailPage.notFoundTitle}
        body={dict.savedPage.invalidScenarioMessage}
      />
    );
  }

  // Only the lookup key crosses into the URL — the calculator re-derives
  // the trusted name/updatedAt itself via a fresh, RLS-scoped server read
  // (see calculator/page.tsx's resolveEditContext), never from this URL.
  const editQuery = applyTracksToQuery(new URLSearchParams(), payload.tracks);
  editQuery.set("savedScenarioId", row.id);
  const editHref = `/${locale}/calculator?${editQuery.toString()}`;

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
  const percentFormat = new Intl.NumberFormat(intlLocale, {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const numberFormat = new Intl.NumberFormat(intlLocale);
  const monthParts = paymentMonthParts(resultSnapshot.highestPaymentMonth);
  const highestPaymentMonthText = dict.calculator.maxMonthTemplate
    .replace("{m}", numberFormat.format(monthParts.month))
    .replace("{y}", numberFormat.format(monthParts.year))
    .replace("{my}", numberFormat.format(monthParts.monthOfYear));

  const stabilityLevelLabels: Record<string, string> = {
    veryHigh: dict.calculator.stabilityVeryHigh,
    high: dict.calculator.stabilityHigh,
    medium: dict.calculator.stabilityMedium,
    low: dict.calculator.stabilityLow,
    veryLow: dict.calculator.stabilityVeryLow,
  };

  return (
    <main className="bg-slate-50 text-slate-900">
      <section className="mx-auto max-w-3xl px-6 pt-10 pb-16 sm:pt-12">
        <Link
          href={`/${locale}/saved`}
          className="text-sm text-slate-500 transition hover:text-slate-800"
        >
          {dict.scenarioDetailPage.backToSavedLabel}
        </Link>

        <h1 className="mt-3 mb-1 text-2xl font-bold tracking-tight sm:text-3xl">
          {row.name}
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          {dict.savedPage.cardUpdatedLabel} {formatDateOnly(row.updated_at, locale)}
          {" · "}
          {dict.scenarioDetailPage.calculatedAtLabel}{" "}
          {formatDateOnly(row.calculated_at, locale)}
        </p>

        {/* Hero: mirrors the calculator's own hero panel for visual
            consistency between "what I calculated" and "what I saved". */}
        <div className="rounded-2xl bg-accent-soft p-5 sm:p-6">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium text-slate-600">
                {dict.savedPage.cardFirstPaymentLabel}
              </div>
              <div className="mt-1 text-4xl font-bold tracking-tight text-slate-900 tabular-nums sm:text-5xl">
                {currencyFormat.format(resultSnapshot.firstPayment)}
              </div>
            </div>
            <StabilityMeter
              score={resultSnapshot.stabilityScore}
              levelLabel={
                stabilityLevelLabels[stabilityLevel(resultSnapshot.stabilityScore)]
              }
              accessibleLabel={dict.savedPage.cardStabilityLabel}
            />
          </div>
        </div>

        <Link
          href={editHref}
          className="mt-3 inline-block rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90"
        >
          {dict.scenarioDetailPage.editInCalculatorButton}
        </Link>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-slate-200 pt-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">
              {dict.savedPage.cardHighestPaymentLabel}
            </dt>
            <dd className="mt-0.5 text-lg font-semibold text-slate-900 tabular-nums">
              {currencyFormat.format(resultSnapshot.highestPayment)}
            </dd>
            <p className="mt-0.5 text-xs text-slate-500">
              {highestPaymentMonthText}
            </p>
          </div>
          <div>
            <dt className="text-xs text-slate-500">
              {dict.calculator.forecastTotalPaymentLabel}
            </dt>
            <dd className="mt-0.5 text-lg font-semibold text-slate-900 tabular-nums">
              {currencyFormat.format(resultSnapshot.forecastTotalPaid)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">
              {dict.calculator.financingCostLabel}
            </dt>
            <dd className="mt-0.5 text-lg font-semibold text-slate-900 tabular-nums">
              {currencyFormat.format(resultSnapshot.totalInterestOrFinancingCost)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">
              {dict.savedPage.cardAmountLabel}
            </dt>
            <dd className="mt-0.5 text-lg font-semibold text-slate-900 tabular-nums">
              {wholeCurrencyFormat.format(resultSnapshot.totalPrincipal)}
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-sm leading-6 text-slate-600">
          {dict.scenarioDetailPage.snapshotNote}
        </p>

        <h2 className="mt-8 mb-3 text-xl font-bold tracking-tight">
          {dict.calculator.perTrackResultsTitle}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {payload.tracks.map((track, index) => (
            <div
              key={track.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <p className="mb-2 text-sm font-bold text-slate-900">
                {dict.calculator.trackLabel} {index + 1} —{" "}
                {trackTypeLabel(track.trackType, dict.calculator)}
              </p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                {trackRows(
                  track,
                  dict.calculator,
                  wholeCurrencyFormat,
                  percentFormat,
                  numberFormat,
                ).map((row) => (
                  <div key={row.label}>
                    <dt className="text-slate-500">{row.label}</dt>
                    <dd className="font-medium text-slate-900">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
