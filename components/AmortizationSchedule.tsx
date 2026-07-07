"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n/config";
// Type-only import: erased at compile time, keeps the server-only
// dictionary module out of the client bundle.
import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { AmortizationEntry } from "@/lib/mortgage";

type CalculatorLabels = Dictionary["calculator"];

const COLLAPSED_MONTHS = 12;

interface AmortizationScheduleProps {
  /** The schedule as returned by the mortgage engine — no math happens here. */
  schedule: AmortizationEntry[];
  labels: CalculatorLabels;
  locale: Locale;
}

interface PaymentBreakdownCardProps {
  title: string;
  entry: AmortizationEntry;
  labels: CalculatorLabels;
  formatCurrency: (value: number) => string;
  formatPercent: (fraction: number) => string;
}

/** One payment shown as principal vs. interest, with a proportional bar. */
function PaymentBreakdownCard({
  title,
  entry,
  labels,
  formatCurrency,
  formatPercent,
}: PaymentBreakdownCardProps) {
  const principalShare = entry.principalPayment / entry.payment;
  const interestShare = entry.interestPayment / entry.payment;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">{title}</span>
        <span className="text-sm text-slate-500">
          {formatCurrency(entry.payment)}
        </span>
      </div>

      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100">
        <div
          className="bg-slate-900"
          style={{ width: `${principalShare * 100}%` }}
        />
        <div
          className="bg-slate-300"
          style={{ width: `${interestShare * 100}%` }}
        />
      </div>

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-2 text-slate-600">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-slate-900" />
            {labels.principalLabel}
          </dt>
          <dd className="font-medium text-slate-900">
            {formatCurrency(entry.principalPayment)} ({formatPercent(principalShare)})
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-2 text-slate-600">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-slate-300" />
            {labels.interestLabel}
          </dt>
          <dd className="font-medium text-slate-900">
            {formatCurrency(entry.interestPayment)} ({formatPercent(interestShare)})
          </dd>
        </div>
      </dl>
    </div>
  );
}

export default function AmortizationSchedule({
  schedule,
  labels,
  locale,
}: AmortizationScheduleProps) {
  const [expanded, setExpanded] = useState(false);

  const intlLocale = locale === "he" ? "he-IL" : "en-US";
  const currencyFormat = new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  });
  const percentFormat = new Intl.NumberFormat(intlLocale, {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const formatCurrency = (value: number) => currencyFormat.format(value);
  const formatPercent = (fraction: number) => percentFormat.format(fraction);

  const firstEntry = schedule[0];
  const lastEntry = schedule[schedule.length - 1];
  // Rows beyond the first year are only rendered after the user expands.
  const visibleRows = expanded ? schedule : schedule.slice(0, COLLAPSED_MONTHS);

  const numericHeader = "px-4 py-3 text-end font-medium text-slate-600";
  const numericCell = "px-4 py-2.5 text-end whitespace-nowrap text-slate-700";

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-2xl font-bold tracking-tight">
        {labels.scheduleTitle}
      </h2>
      {labels.scheduleIntro.map((paragraph) => (
        <p key={paragraph} className="mb-2 text-sm leading-6 text-slate-600">
          {paragraph}
        </p>
      ))}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <PaymentBreakdownCard
          title={labels.firstPaymentLabel}
          entry={firstEntry}
          labels={labels}
          formatCurrency={formatCurrency}
          formatPercent={formatPercent}
        />
        <PaymentBreakdownCard
          title={labels.lastPaymentLabel}
          entry={lastEntry}
          labels={labels}
          formatCurrency={formatCurrency}
          formatPercent={formatPercent}
        />
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th scope="col" className="px-4 py-3 text-start font-medium text-slate-600">
                {labels.monthHeader}
              </th>
              <th scope="col" className={numericHeader}>
                {labels.paymentHeader}
              </th>
              <th scope="col" className={numericHeader}>
                {labels.principalLabel}
              </th>
              <th scope="col" className={numericHeader}>
                {labels.interestLabel}
              </th>
              <th scope="col" className={numericHeader}>
                {labels.remainingBalanceHeader}
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((entry) => (
              <tr
                key={entry.month}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="px-4 py-2.5 text-start text-slate-500">
                  {entry.month}
                </td>
                <td className={numericCell}>{formatCurrency(entry.payment)}</td>
                <td className={numericCell}>
                  {formatCurrency(entry.principalPayment)}
                </td>
                <td className={numericCell}>
                  {formatCurrency(entry.interestPayment)}
                </td>
                <td className={numericCell}>
                  {formatCurrency(entry.remainingBalance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {schedule.length > COLLAPSED_MONTHS && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-4 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm text-slate-700 transition hover:bg-slate-100"
        >
          {expanded ? labels.showLess : labels.showFullSchedule}
        </button>
      )}
    </section>
  );
}
