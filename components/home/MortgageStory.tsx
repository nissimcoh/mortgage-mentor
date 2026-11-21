"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import { buildLoanStory, loanPointAt } from "@/lib/ui/loan-story";

type Labels = Dictionary["home"];

// The worked example the section narrates. The figures inside the beats are
// derived from it below; storyIntro in the dictionaries names these inputs,
// so keep the two in step.
const EXAMPLE = { amount: 1_000_000, rate: 5, years: 30 } as const;
const STORY = buildLoanStory(EXAMPLE.amount, EXAMPLE.rate, EXAMPLE.years);

const W = 640;
const H = 300;
const PAD = 6;
const x = (year: number) => (year / STORY.years) * W;
const y = (balance: number) => PAD + (1 - balance / STORY.loanAmount) * (H - PAD * 2);
const CURVE = STORY.points.map((point, index) => `${index === 0 ? "M" : "L"}${x(point.year).toFixed(1)},${y(point.balance).toFixed(1)}`).join(" ");
const AREA = `${CURVE} L${W},${H} L0,${H} Z`;

/** 0 at the moment the section pins, 1 when it releases. */
function usePinnedProgress(ref: React.RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const next = travel <= 0 ? 0 : Math.min(1, Math.max(0, -rect.top / travel));
      setProgress((current) => (Math.abs(current - next) < 0.0015 ? current : next));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    // Only listen while the section is near the viewport.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { window.addEventListener("scroll", onScroll, { passive: true }); window.addEventListener("resize", onScroll); measure(); }
      else { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); }
    }, { rootMargin: "200px 0px" });
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);
  return progress;
}

/**
 * A pinned, scroll-driven walk through one 30-year loan: scrolling moves time
 * forward, the balance curve draws itself, and the split of the monthly
 * payment between interest and principal shifts as it really does.
 */
export default function MortgageStory({ locale, labels }: { locale: Locale; labels: Labels }) {
  const sectionRef = useRef<HTMLElement>(null);
  const progress = usePinnedProgress(sectionRef);

  const intl = locale === "he" ? "he-IL" : "en-US";
  const money = useMemo(() => new Intl.NumberFormat(intl, { style: "currency", currency: "ILS", maximumFractionDigits: 0 }), [intl]);
  const percent = useMemo(() => new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 0 }), [intl]);

  // Leave a short hold at both ends so the first and last frames are readable.
  const t = Math.min(1, Math.max(0, (progress - 0.06) / 0.86));
  const year = t * STORY.years;
  const point = loanPointAt(STORY, year);
  // Running figures are shown to the nearest thousand while they move, and
  // exactly once the loan is fully repaid.
  const running = (value: number) => money.format(t >= 1 ? Math.round(value) : Math.round(value / 1000) * 1000);
  const crossoverYear = Math.ceil(STORY.crossoverMonth / 12);

  const beats = useMemo(() => labels.storyBeats.map((beat) => ({
    title: beat.title,
    body: beat.body
      .replace("{share}", percent.format(STORY.points[0].interestShare))
      .replace("{year}", String(crossoverYear))
      .replace("{interest}", money.format(Math.round(STORY.totalInterest))),
  })), [labels.storyBeats, percent, money, crossoverYear]);
  // Beat boundaries follow the loan itself: the turning point starts beat 2.
  const starts = [0, crossoverYear - 2.5, 22, 28.5];
  const beatIndex = starts.reduce((active, start, index) => (year >= start ? index : active), 0);

  return (
    <section ref={sectionRef} aria-labelledby="story-title" className="story" style={{ height: "calc(100svh * 4)" }}>
      <div className="story-stage">
        <div className="mx-auto grid h-full w-full max-w-6xl content-center gap-6 px-5 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
          <div className="flex flex-col justify-center">
            <p className="text-sm font-semibold text-[#6fd6bd]">{labels.storyEyebrow}</p>
            <h2 id="story-title" className="mt-2 whitespace-pre-line text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl">{labels.storyTitle}</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-white/55 sm:text-base">{labels.storyIntro}</p>

            {/* All beats stay in the document; only one is visible at a time. */}
            <ol className="relative mt-6 grid sm:mt-10">
              {beats.map((beat, index) => (
                <li key={beat.title} aria-current={index === beatIndex ? "step" : undefined}
                  className={`col-start-1 row-start-1 transition-[opacity,transform] duration-500 ${index === beatIndex ? "opacity-100" : index < beatIndex ? "pointer-events-none -translate-y-3 opacity-0" : "pointer-events-none translate-y-3 opacity-0"}`}>
                  <p className="text-xs font-medium tabular-nums text-white/40"><bdi dir="ltr">{String(index + 1).padStart(2, "0")} / {String(beats.length).padStart(2, "0")}</bdi></p>
                  <h3 className="mt-1.5 text-xl font-semibold tracking-tight text-white sm:text-3xl">{beat.title}</h3>
                  <p className="mt-2 max-w-md text-sm leading-6 text-white/65 sm:text-lg sm:leading-8">{beat.body}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-col justify-center">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs text-white/45 sm:text-sm">{labels.storyYear}</p>
                <p className="text-5xl font-semibold leading-none tracking-tight tabular-nums text-white sm:text-7xl">{Math.floor(year)}</p>
              </div>
              <div className="text-end">
                <p className="text-xs text-white/45 sm:text-sm">{labels.storyBalance}</p>
                <p className="text-2xl font-semibold leading-none tracking-tight tabular-nums text-white sm:text-4xl"><bdi>{running(point.balance)}</bdi></p>
              </div>
            </div>

            <div dir="ltr" className="mt-4">
              <div className="relative">
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-40 w-full sm:h-64" role="img" aria-label={labels.storyChartLabel}>
                <defs>
                  <linearGradient id="story-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#2fb89d" stopOpacity=".5" />
                    <stop offset="100%" stopColor="#2fb89d" stopOpacity="0" />
                  </linearGradient>
                  <clipPath id="story-reveal"><rect x="0" y="0" width={x(year)} height={H} /></clipPath>
                </defs>
                {[0.25, 0.5, 0.75].map((line) => <line key={line} x1="0" x2={W} y1={PAD + line * (H - PAD * 2)} y2={PAD + line * (H - PAD * 2)} stroke="#fff" strokeOpacity=".07" vectorEffect="non-scaling-stroke" />)}
                <path d={CURVE} fill="none" stroke="#fff" strokeOpacity=".16" strokeWidth="1.5" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
                <g clipPath="url(#story-reveal)">
                  <path d={AREA} fill="url(#story-fill)" />
                  <path d={CURVE} fill="none" stroke="#6fd6bd" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </g>
                <line x1={x(year)} x2={x(year)} y1="0" y2={H} stroke="#fff" strokeOpacity=".25" vectorEffect="non-scaling-stroke" />
              </svg>
              <span aria-hidden="true" className="story-dot" style={{ left: `${(year / STORY.years) * 100}%`, top: `${(y(point.balance) / H) * 100}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-white/40"><span>0</span><span>10</span><span>20</span><span>30</span></div>
            </div>

            <div className="mt-5 sm:mt-7">
              <div className="flex items-baseline justify-between text-xs text-white/55 sm:text-sm">
                <span>{labels.storySplit}</span>
                <span>{labels.storyInterestPaid}: <bdi className="font-semibold tabular-nums text-white">{running(point.interestPaid)}</bdi></span>
              </div>
              <div dir="ltr" className="mt-2 flex h-3 gap-[3px] overflow-hidden rounded-full" aria-hidden="true">
                {point.interestShare > 0.01 && <span className="h-full bg-[#e3bf78]" style={{ width: `${point.interestShare * 100}%` }} />}
                <span className="h-full flex-1 bg-[#2fb89d]" />
              </div>
              <div dir="ltr" className="mt-2 flex justify-between text-xs sm:text-sm">
                <span className="text-[#e3bf78]">{labels.storyToInterest} <bdi className="font-semibold tabular-nums">{percent.format(point.interestShare)}</bdi></span>
                <span className="text-[#6fd6bd]">{labels.storyToPrincipal} <bdi className="font-semibold tabular-nums">{percent.format(1 - point.interestShare)}</bdi></span>
              </div>
            </div>
          </div>
        </div>

        <Link href={`/${locale}/calculator`}
          className={`story-cta transition-[opacity,transform] duration-500 ${beatIndex === beats.length - 1 ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0"}`}
          tabIndex={beatIndex === beats.length - 1 ? 0 : -1}>
          {labels.storyCta}
        </Link>
      </div>
    </section>
  );
}
