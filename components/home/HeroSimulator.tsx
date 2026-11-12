"use client";

import { useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import { buildLoanStory, loanPointAt, loanStoryCalculatorHref, LOAN_STORY_LIMITS } from "@/lib/ui/loan-story";
import Icon from "@/components/Icon";

type Labels = Dictionary["home"];

const W = 640;
const H = 220;

function Slider({ label, value, display, min, max, step, onChange }: {
  label: string; value: number; display: string; min: number; max: number; step: number; onChange: (value: number) => void;
}) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm text-slate-500">{label}</label>
        <output htmlFor={id} className="text-xl font-semibold tracking-tight tabular-nums text-slate-900 sm:text-2xl"><bdi>{display}</bdi></output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-valuetext={display}
        className="mm-range mt-2 w-full" style={{ "--fill": `${fill}%` } as CSSProperties} />
    </div>
  );
}

/**
 * The home page's live example: three sliders drive a real fixed-rate
 * Spitzer calculation (see lib/ui/loan-story.ts), and the chart shows how
 * each monthly payment splits between interest and principal over the years.
 */
export default function HeroSimulator({ locale, labels }: { locale: Locale; labels: Labels }) {
  const [amount, setAmount] = useState(1_200_000);
  const [years, setYears] = useState(25);
  const [rate, setRate] = useState(4.8);
  const [scrubYear, setScrubYear] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const intl = locale === "he" ? "he-IL" : "en-US";
  const money = useMemo(() => new Intl.NumberFormat(intl, { style: "currency", currency: "ILS", maximumFractionDigits: 0 }), [intl]);
  const percent = useMemo(() => new Intl.NumberFormat(intl, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }), [intl]);
  const wholePercent = useMemo(() => new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 0 }), [intl]);
  const ratio = useMemo(() => new Intl.NumberFormat(intl, { style: "currency", currency: "ILS", minimumFractionDigits: 2, maximumFractionDigits: 2 }), [intl]);

  const story = useMemo(() => buildLoanStory(amount, rate, years), [amount, rate, years]);

  // Principal share rises from the first payment to the last: the teal area.
  const area = useMemo(() => {
    const top = story.points.map((point, index) => `${index === 0 ? "M" : "L"}${((index / story.years) * W).toFixed(1)},${(point.interestShare * H).toFixed(1)}`).join(" ");
    return { line: top, fill: `${top} L${W},${H} L0,${H} Z` };
  }, [story]);

  const activeYear = scrubYear === null ? null : Math.min(scrubYear, story.years);
  const point = loanPointAt(story, activeYear ?? 0);
  const cursorX = ((activeYear ?? 0) / story.years) * 100;

  function yearFromPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    return Math.round(t * story.years);
  }
  function onChartKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = activeYear ?? 0;
    const next = event.key === "ArrowRight" ? current + 1 : event.key === "ArrowLeft" ? current - 1
      : event.key === "Home" ? 0 : event.key === "End" ? story.years : null;
    if (next === null) return;
    event.preventDefault();
    setScrubYear(Math.min(story.years, Math.max(0, next)));
  }

  const scrubTitle = activeYear === null || activeYear === 0 ? labels.simScrubStart : labels.simScrubYear.replace("{year}", String(activeYear));
  const stats = [
    { label: labels.simTotalInterest, value: money.format(story.totalInterest) },
    { label: labels.simTotalPaid, value: money.format(story.totalPaid) },
    { label: labels.simPerShekel, value: ratio.format(story.totalPaid / story.loanAmount) },
  ];

  return (
    <div className="sim-stage">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
        <div className="flex flex-col">
          <p className="text-sm font-semibold text-accent">{labels.simEyebrow}</p>
          <h2 className="mt-2 text-3xl font-semibold leading-[1.1] tracking-tight text-slate-900 sm:text-4xl">{labels.simTitle}</h2>
          <p className="mt-3 text-base leading-7 text-slate-500">{labels.simSubtitle}</p>
          <div className="mt-7 space-y-6">
            <Slider label={labels.simAmount} value={amount} display={money.format(amount)} {...LOAN_STORY_LIMITS.amount} onChange={setAmount} />
            <Slider label={labels.simYears} value={years} display={`${years} ${labels.simYearsUnit}`} {...LOAN_STORY_LIMITS.years}
              onChange={(value) => { setYears(value); setScrubYear(null); }} />
            <Slider label={labels.simRate} value={rate} display={percent.format(rate / 100)} {...LOAN_STORY_LIMITS.rate} onChange={setRate} />
          </div>
        </div>

        <div className="sim-card">
          <p className="text-sm text-slate-500">{labels.simMonthly}</p>
          <p className="mt-1 text-5xl font-semibold leading-none tracking-tight tabular-nums text-slate-900 sm:text-7xl" aria-live="polite">
            <bdi>{money.format(Math.round(story.monthlyPayment))}</bdi>
          </p>

          <div className="mt-7 flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{labels.simChartTitle}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {scrubTitle}
                {activeYear !== null && <> · {labels.simBalance} <bdi className="tabular-nums">{money.format(Math.round(point.balance))}</bdi></>}
              </p>
            </div>
            <ul className="flex shrink-0 gap-3 text-xs text-slate-600">
              <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#d9b877]" />{labels.simInterest} <bdi className="font-semibold tabular-nums text-slate-900">{wholePercent.format(point.interestShare)}</bdi></li>
              <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent" />{labels.simPrincipal} <bdi className="font-semibold tabular-nums text-slate-900">{wholePercent.format(1 - point.interestShare)}</bdi></li>
            </ul>
          </div>

          {/* Time always runs left to right, in both languages, like the
              calculator's own charts. */}
          <div dir="ltr" className="mt-3">
            <div
              ref={chartRef}
              role="slider"
              tabIndex={0}
              aria-label={labels.simChartLabel}
              aria-valuemin={0}
              aria-valuemax={story.years}
              aria-valuenow={activeYear ?? 0}
              aria-valuetext={`${scrubTitle}: ${labels.simInterest} ${wholePercent.format(point.interestShare)}, ${labels.simPrincipal} ${wholePercent.format(1 - point.interestShare)}`}
              onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setScrubYear(yearFromPointer(event)); }}
              onPointerMove={(event) => { if (event.pointerType === "mouse" || event.buttons > 0) setScrubYear(yearFromPointer(event)); }}
              onPointerLeave={(event) => { if (event.pointerType === "mouse") setScrubYear(null); }}
              onKeyDown={onChartKeyDown}
              onBlur={() => setScrubYear(null)}
              className="sim-chart relative cursor-ew-resize touch-pan-y select-none overflow-hidden rounded-2xl"
            >
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-44 w-full sm:h-56" aria-hidden="true">
                <rect width={W} height={H} fill="#f3e7cd" />
                <path d={area.fill} fill="var(--accent)" className="sim-area" />
                <path d={area.line} fill="none" stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" className="sim-area" />
              </svg>
              {activeYear !== null && (
                <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px bg-slate-900/70" style={{ left: `${cursorX}%` }}>
                  <span className="absolute left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-900 shadow" style={{ top: `${point.interestShare * 100}%` }} />
                </span>
              )}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-slate-500">
              <span>0</span>
              <span>{Math.round(story.years / 2)}</span>
              <span>{story.years}</span>
            </div>
          </div>
          <p className="mt-1 text-center text-[11px] text-slate-400">{labels.simScrubHint}</p>

          <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-black/[.07] pt-5 sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="flex items-baseline justify-between gap-3 sm:block">
                <dt className="text-xs text-slate-500">{stat.label}</dt>
                <dd className="text-lg font-semibold tracking-tight tabular-nums text-slate-900 sm:mt-1 sm:text-xl"><bdi>{stat.value}</bdi></dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-start justify-between gap-4 border-t border-black/[.07] pt-6 sm:flex-row sm:items-center">
        <p className="max-w-xl text-xs leading-5 text-slate-500">{labels.simNote}</p>
        <Link href={loanStoryCalculatorHref(locale, story)} prefetch={false}
          className="group inline-flex shrink-0 items-center gap-1 text-[15px] font-medium text-accent hover:underline hover:underline-offset-4">
          {labels.simContinue}
          <Icon name="chevron" size={14} strokeWidth={2.2} className="transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
