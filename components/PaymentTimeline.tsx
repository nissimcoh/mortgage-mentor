"use client";

import { memo, useId, useMemo, useState } from "react";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { AmortizationEntry, MortgageTrackInput } from "@/lib/mortgage/types";
import { buildMortgageMilestones } from "@/lib/mortgage/milestones";
import type { Locale } from "@/lib/i18n/config";

/** Reads the actual monthly schedule; never resamples or recalculates payments. */
const PaymentTimeline = memo(function PaymentTimeline({ schedule, tracks, locale, labels }: {
  schedule: AmortizationEntry[];
  tracks: MortgageTrackInput[];
  locale: Locale;
  labels: Dictionary["calculator"];
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const id = useId();
  const milestones = useMemo(() => buildMortgageMilestones(tracks), [tracks]);
  const milestoneText = (event: (typeof milestones)[number]["events"][number]) =>
    `${labels.trackLabel} ${event.trackIndex + 1}: ${event.kind === "reset" ? labels.milestoneReset : labels.milestoneEnd}`;
  const index = Math.min(selectedIndex, schedule.length - 1);
  const entry = schedule[index];
  const currency = useMemo(() => new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    style: "currency", currency: "ILS", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }), [locale]);
  const { points, maximum } = useMemo(() => {
    const maximum = Math.max(1, ...schedule.map(row => row.payment));
    const x = (i: number) => 12 + (i / Math.max(1, schedule.length - 1)) * 776;
    const y = (payment: number) => 168 - (payment / maximum) * 144;
    const points = schedule.map((row, i) => `${x(i)},${y(row.payment)}`).join(" ");
    return { points, maximum };
  }, [schedule]);
  if (schedule.length === 0) return null;
  const x = (i: number) => 12 + (i / Math.max(1, schedule.length - 1)) * 776;
  const y = (payment: number) => 168 - (payment / maximum) * 144;
  return (
    <section aria-labelledby={`${id}-title`} className="mt-6 overflow-hidden glass-panel rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="text-xl font-bold tracking-tight text-slate-900">{labels.timelineTitle}</h2>
        <span className="rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent">
          {labels.timelineMonth} {entry.month} / {schedule.length}
        </span>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{labels.timelineHelp}</p>
      <dl className="mt-5 grid grid-cols-1 gap-4 min-[380px]:grid-cols-2">
        <div>
          <dt className="text-xs text-slate-500">{labels.timelinePayment}</dt>
          <dd className="mt-1 text-2xl font-semibold text-accent tabular-nums">{currency.format(entry.payment)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">{labels.timelineBalance}</dt>
          <dd className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{currency.format(entry.remainingBalance)}</dd>
        </div>
      </dl>
      <div dir="ltr" className="mt-5">
        <svg viewBox="0 0 800 184" className="h-40 w-full sm:h-48" preserveAspectRatio="none" aria-hidden="true">
          {[24, 96, 168].map(level => <line key={level} x1="12" x2="788" y1={level} y2={level} stroke="#e2e8f0" strokeDasharray="4 5" />)}
          <polygon points={`12,168 ${points} ${x(schedule.length - 1)},168`} fill="#e4f1ef" />
          <polyline points={points} fill="none" stroke="#0f6e68" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {milestones.map(milestone => (
            <line key={milestone.month} x1={x(milestone.month - 1)} x2={x(milestone.month - 1)} y1="16" y2="168"
              stroke={milestone.events.some(event => event.kind === "reset") ? "#b45309" : "#047857"}
              strokeDasharray="2 4" opacity="0.65" />
          ))}
          <line x1={x(index)} x2={x(index)} y1="12" y2="172" stroke="#64748b" strokeDasharray="4 4" />
          <circle cx={x(index)} cy={y(entry.payment)} r="4" fill="#0f6e68" stroke="white" strokeWidth="2" />
        </svg>
        <label htmlFor={`${id}-month`} className="sr-only">{labels.timelineMonth}</label>
        <input id={`${id}-month`} type="range" min="1" max={schedule.length} step="1" value={index + 1}
          onChange={event => setSelectedIndex(Number(event.target.value) - 1)}
          aria-valuetext={`${labels.timelineMonth} ${entry.month}, ${labels.timelinePayment}: ${currency.format(entry.payment)}, ${labels.timelineBalance}: ${currency.format(entry.remainingBalance)}`}
          className="h-8 w-full cursor-pointer accent-accent" />
        <div className="flex justify-between text-xs text-slate-500">
          <span>{labels.timelineStart}</span><span>{labels.timelineEnd}</span>
        </div>
      </div>
      <p className="mt-4 text-xs leading-6 text-slate-600">{labels.milestoneHelp}</p>
      <label htmlFor={`${id}-milestone`} className="mt-3 block text-sm font-medium">{labels.milestoneJump}</label>
      <select id={`${id}-milestone`} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
        value={milestones.some(milestone => milestone.month === entry.month) ? entry.month : ""}
        onChange={event => { if (event.target.value) setSelectedIndex(Number(event.target.value) - 1); }}>
        <option value="">{labels.milestoneChoose}</option>
        {milestones.map(milestone => <option key={milestone.month} value={milestone.month}>
          {labels.timelineMonth} {milestone.month} — {milestone.events.map(milestoneText).join("; ")}
        </option>)}
      </select>
      <div aria-live="polite" className="mt-2 text-sm text-slate-700">
        {milestones.find(milestone => milestone.month === entry.month)?.events.map((event, eventIndex) => <p key={eventIndex}>{milestoneText(event)}</p>)}
      </div>
    </section>
  );
});

export default PaymentTimeline;
