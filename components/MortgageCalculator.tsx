"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/i18n/config";
// Type-only import: erased at compile time, so the server-only dictionary
// module is never bundled into this Client Component.
import type { Dictionary } from "@/app/[locale]/dictionaries";
import {
  calculateTrackSummary,
  nominalAnnualPercentToEffectiveAnnualPercent,
  type TrackSummary,
} from "@/lib/mortgage";
import AmortizationSchedule from "./AmortizationSchedule";

type CalculatorLabels = Dictionary["calculator"];

interface MortgageCalculatorProps {
  locale: Locale;
  labels: CalculatorLabels;
}

// The form exposes exactly one option per select for now. Keeping the
// supported values in one place keeps the selects, the URL parsing, and the
// engine call in sync when more tracks/methods are added.
const SUPPORTED_TRACK_TYPE = "fixedUnlinked";
const SUPPORTED_REPAYMENT_METHOD = "spitzer";
const DURATION_YEARS = Array.from({ length: 30 }, (_, index) => index + 1);

interface FormValues {
  loanAmount: string;
  ratePercent: string;
  years: string;
  trackType: string;
  repaymentMethod: string;
}

const EMPTY_VALUES: FormValues = {
  loanAmount: "",
  ratePercent: "",
  years: "",
  trackType: SUPPORTED_TRACK_TYPE,
  repaymentMethod: SUPPORTED_REPAYMENT_METHOD,
};

/**
 * Parse a loan amount typed by a user: whole shekels only, commas and
 * spaces allowed ("800000", "800,000"). Returns null when invalid.
 */
function parseLoanAmount(raw: string): number | null {
  const digits = raw.replace(/[\s,₪]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const value = Number(digits);
  return value > 0 ? value : null;
}

/**
 * Parse an annual rate typed by a user: non-negative decimal, accepting
 * both "4.8" and "4,8". Returns null when invalid.
 */
function parseRatePercent(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".").replace(/%$/, "");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

/** Thousands separators for display; the URL always stores plain digits. */
function formatLoanAmountForDisplay(value: number): string {
  return value.toLocaleString("en-US");
}

function tryCalculate(values: FormValues): TrackSummary | null {
  if (
    values.trackType !== SUPPORTED_TRACK_TYPE ||
    values.repaymentMethod !== SUPPORTED_REPAYMENT_METHOD
  ) {
    return null;
  }

  const loanAmount = parseLoanAmount(values.loanAmount);
  const ratePercent = parseRatePercent(values.ratePercent);
  if (loanAmount === null || ratePercent === null) return null;

  try {
    return calculateTrackSummary({
      type: SUPPORTED_TRACK_TYPE,
      repaymentMethod: SUPPORTED_REPAYMENT_METHOD,
      loanAmount,
      annualInterestRatePercent: ratePercent,
      // The public calculator keeps input simple: the entered rate is always
      // treated as the bank-quoted nominal annual rate. The engine's
      // "effectiveAnnual" input mode remains available for advanced use.
      interestRateInputMode: "nominalAnnual",
      years: Number(values.years),
    });
  } catch {
    return null;
  }
}

/** Read form values from the URL (shared links, language switching). */
function readValuesFromQuery(searchParams: URLSearchParams): FormValues | null {
  const loanAmount = searchParams.get("loanAmount");
  const ratePercent = searchParams.get("annualInterestRatePercent");
  const years = searchParams.get("years");
  if (loanAmount === null || ratePercent === null || years === null) {
    return null;
  }
  return {
    loanAmount,
    ratePercent,
    years,
    // Older shared URLs predate these two params; default to the only
    // supported options so those links keep working.
    trackType: searchParams.get("trackType") ?? SUPPORTED_TRACK_TYPE,
    repaymentMethod:
      searchParams.get("repaymentMethod") ?? SUPPORTED_REPAYMENT_METHOD,
  };
}

const labelClass = "mb-1 block text-sm font-medium text-slate-700";
const fieldClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500";
const unitClass =
  "pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-slate-400";

export default function MortgageCalculator({
  locale,
  labels,
}: MortgageCalculatorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initialize once from the URL, so opening a link with valid query params
  // (e.g. after switching language) restores both inputs and result.
  const [initial] = useState(() => {
    const values = readValuesFromQuery(searchParams);
    if (!values) return null;
    const summary = tryCalculate(values);
    if (!summary) return null;
    const loanAmount = parseLoanAmount(values.loanAmount);
    return {
      values: {
        ...values,
        loanAmount:
          loanAmount === null
            ? values.loanAmount
            : formatLoanAmountForDisplay(loanAmount),
      },
      summary,
      ratePercent: parseRatePercent(values.ratePercent),
    };
  });

  const [values, setValues] = useState<FormValues>(
    initial?.values ?? EMPTY_VALUES,
  );
  const [summary, setSummary] = useState<TrackSummary | null>(
    initial?.summary ?? null,
  );
  const [submittedRatePercent, setSubmittedRatePercent] = useState<
    number | null
  >(initial?.ratePercent ?? null);
  const [hasError, setHasError] = useState(false);

  const intlLocale = locale === "he" ? "he-IL" : "en-US";
  const currencyFormat = new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  });
  const numberFormat = new Intl.NumberFormat(intlLocale);
  const percentFormat = new Intl.NumberFormat(intlLocale, {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  function setField(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function handleLoanAmountBlur() {
    const parsed = parseLoanAmount(values.loanAmount);
    if (parsed !== null) {
      setField("loanAmount", formatLoanAmountForDisplay(parsed));
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = tryCalculate(values);
    if (!result) {
      setSummary(null);
      setSubmittedRatePercent(null);
      setHasError(true);
      return;
    }

    // Safe: tryCalculate already succeeded, so both parse.
    const loanAmount = parseLoanAmount(values.loanAmount)!;
    const ratePercent = parseRatePercent(values.ratePercent)!;

    setSummary(result);
    setSubmittedRatePercent(ratePercent);
    setHasError(false);

    // Persist normalized inputs (no commas, dot decimal) in the URL so the
    // result survives sharing the link and switching languages.
    const query = new URLSearchParams({
      loanAmount: String(loanAmount),
      annualInterestRatePercent: String(ratePercent),
      years: values.years.trim(),
      trackType: values.trackType,
      repaymentMethod: values.repaymentMethod,
    });
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  }

  const results =
    summary && submittedRatePercent !== null
      ? [
          {
            label: labels.monthlyPayment,
            value: currencyFormat.format(summary.monthlyPayment),
            help: labels.monthlyPaymentHelp,
          },
          {
            label: labels.effectiveRateLabel,
            value: percentFormat.format(
              nominalAnnualPercentToEffectiveAnnualPercent(
                submittedRatePercent,
              ) / 100,
            ),
            help: labels.effectiveRateHelp,
          },
          {
            label: labels.totalPayment,
            value: currencyFormat.format(summary.totalPayment),
            help: labels.totalPaymentHelp,
          },
          {
            label: labels.totalInterest,
            value: currencyFormat.format(summary.totalInterest),
            help: labels.totalInterestHelp,
          },
          {
            label: labels.numberOfPayments,
            value: numberFormat.format(summary.numberOfPayments),
            help: undefined,
          },
        ]
      : [];

  const fieldExplanations = [
    { term: labels.loanAmountLabel, explanation: labels.loanAmountHelp },
    { term: labels.trackTypeLabel, explanation: labels.trackTypeHelp },
    {
      term: labels.repaymentMethodLabel,
      explanation: labels.repaymentMethodHelp,
    },
    { term: labels.yearsLabel, explanation: labels.yearsHelp },
    { term: labels.interestRateLabel, explanation: labels.interestRateHelp },
  ];

  return (
    <div className="w-full">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 className="mb-3 text-lg font-bold text-slate-900">
          {labels.trackHeading}
        </h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1.3fr_1fr_1fr_1fr_1fr]">
          <label className="block">
            <span className={labelClass}>{labels.loanAmountLabel}</span>
            <span className="relative block">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                value={values.loanAmount}
                onChange={(event) => setField("loanAmount", event.target.value)}
                onBlur={handleLoanAmountBlur}
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
              value={values.trackType}
              onChange={(event) => setField("trackType", event.target.value)}
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
              value={values.repaymentMethod}
              onChange={(event) =>
                setField("repaymentMethod", event.target.value)
              }
              className={fieldClass}
            >
              <option value={SUPPORTED_REPAYMENT_METHOD}>
                {labels.repaymentMethodSpitzer}
              </option>
            </select>
          </label>

          <label className="block">
            <span className={labelClass}>{labels.yearsLabel}</span>
            <select
              value={values.years}
              onChange={(event) => setField("years", event.target.value)}
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
                value={values.ratePercent}
                onChange={(event) =>
                  setField("ratePercent", event.target.value)
                }
                className={`${fieldClass} pe-9`}
              />
              <span aria-hidden className={unitClass}>
                %
              </span>
            </span>
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-6 py-2.5 text-white transition hover:bg-slate-700"
          >
            {labels.calculateButton}
          </button>
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

      {results.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {results.map((result) => (
            <div
              key={result.label}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="text-sm text-slate-500">{result.label}</div>
              <div className="mt-1 text-xl font-bold text-slate-900 xl:text-2xl">
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
      )}

      {summary && (
        <AmortizationSchedule
          // Remount on a new calculation so the table collapses back to the
          // first year.
          key={`${summary.numberOfPayments}-${summary.monthlyPayment}-${summary.totalInterest}`}
          schedule={summary.schedule}
          labels={labels}
          locale={locale}
        />
      )}

      <p className="mt-5 text-sm leading-6 text-slate-500">
        {labels.disclaimer}
      </p>
    </div>
  );
}
