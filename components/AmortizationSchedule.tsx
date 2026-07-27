"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
// Type-only import: erased at compile time, keeps the server-only
// dictionary module out of the client bundle.
import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { AmortizationEntry } from "@/lib/mortgage";

type CalculatorLabels = Dictionary["calculator"];

interface AmortizationScheduleProps {
  /** The schedule as returned by the mortgage engine — no math happens here. */
  schedule: AmortizationEntry[];
  labels: CalculatorLabels;
  locale: Locale;
  /** Section heading, e.g. "לוח סילוקין משולב" or "לוח סילוקין — מסלול 2". */
  title: string;
  /** Optional selector (schedule tabs) rendered directly above the table. */
  selector?: React.ReactNode;
  /** Header for the rate column; defaults to the plain annual-rate label. */
  rateColumnHeader?: string;
  /** Short explanations rendered directly above the table. */
  notes?: string[];
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
  title,
  selector,
  rateColumnHeader,
  notes,
}: AmortizationScheduleProps) {
  // Detects real overflow (not a breakpoint guess) so the sideways-scroll
  // hint and edge fade only show up when the table is actually wider than
  // its container — true on most phones, false once the viewport is wide
  // enough to fit every column.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrollable, setIsScrollable] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const checkOverflow = () =>
      setIsScrollable(el.scrollWidth > el.clientWidth + 1);
    checkOverflow();
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [schedule]);

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
  // Variable-rate (prime forecast) schedules carry the active annual rate.
  const showRateColumn = firstEntry?.activeAnnualRatePercent !== undefined;
  const rateFormat = new Intl.NumberFormat(intlLocale, {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Sticky header cells need their own background and bottom border because
  // they detach from their row while the body scrolls beneath them.
  const stickyHeader =
    "sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-600";
  const numericHeader = `${stickyHeader} text-end`;
  const numericCell = "px-4 py-2.5 text-end whitespace-nowrap text-slate-700";

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-2xl font-bold tracking-tight">{title}</h2>
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

      {selector && <div className="mt-6">{selector}</div>}

      {notes && notes.length > 0 && (
        <div className={selector ? "mb-3" : "mt-6 mb-3"}>
          {notes.map((note) => (
            <p key={note} className="text-xs leading-5 text-slate-500">
              {note}
            </p>
          ))}
        </div>
      )}

      {isScrollable && (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
          <span aria-hidden>↔</span>
          {labels.scheduleScrollHint}
        </p>
      )}

      <div
        className={`relative ${selector || (notes && notes.length > 0) || isScrollable ? "" : "mt-6 "}`}
      >
        <div
          ref={scrollRef}
          className="max-h-[500px] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr>
              <th scope="col" className={`${stickyHeader} text-start`}>
                {labels.monthHeader}
              </th>
              {showRateColumn && (
                <th scope="col" className={numericHeader}>
                  {rateColumnHeader ?? labels.rateHeader}
                </th>
              )}
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
            {schedule.map((entry) => (
              <tr
                key={entry.month}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="px-4 py-2.5 text-start text-slate-500">
                  {entry.month}
                </td>
                {showRateColumn && (
                  <td className={numericCell}>
                    {entry.activeAnnualRatePercent === undefined
                      ? "—"
                      : rateFormat.format(entry.activeAnnualRatePercent / 100)}
                  </td>
                )}
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
        {isScrollable && (
          <>
            {/* Physical (not logical) left/right placement on purpose: each
                strip fades to white at its own true edge, so the cue is
                correct in both RTL and LTR without guessing which side
                currently hides more content. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white to-transparent sm:w-8"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent sm:w-8"
            />
          </>
        )}
      </div>
    </section>
  );
}
