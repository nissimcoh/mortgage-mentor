import { stabilityColorState, type StabilityColorState } from "@/lib/mortgage";

const RING_COLOR_CLASS: Record<StabilityColorState, string> = {
  stable: "text-emerald-600",
  moderate: "text-amber-600",
  unstable: "text-red-600",
};

// Same non-color glyphs already used by the per-track StabilityBadge, kept
// here too so the ring never relies on color alone.
const STATE_GLYPH: Record<StabilityColorState, string> = {
  stable: "●",
  moderate: "◐",
  unstable: "○",
};

interface StabilityMeterProps {
  /** 0–100, unrounded — rounded only for display. */
  score: number;
  /** Plain-language level, e.g. "יציבות גבוהה" / "High stability". */
  levelLabel: string;
  /** Accessible name for the whole meter, e.g. "מדד יציבות". */
  accessibleLabel: string;
  /** Diameter in px. Defaults to a size that reads well beside the hero
   * figure on desktop; pass a smaller value on mobile. */
  size?: number;
}

/**
 * Compact ring meter for the score the product's stability index produces
 * (see lib/mortgage/stability.ts) — pure inline SVG, no dependency. The
 * ring's arc uses the existing semantic emerald/amber/red states, never
 * the brand accent color: this is a status indicator, not a brand moment.
 *
 * The visible score/label stay in the DOM for sighted readers; the outer
 * wrapper carries a single summarizing aria-label so screen readers get
 * one clean announcement instead of fragments from the SVG and text nodes
 * separately.
 */
export default function StabilityMeter({
  score,
  levelLabel,
  accessibleLabel,
  size = 84,
}: StabilityMeterProps) {
  const state = stabilityColorState(score);
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const rounded = Math.round(score);

  return (
    <div
      role="img"
      aria-label={`${accessibleLabel}: ${rounded} ${"/"} 100 — ${levelLabel}`}
      className="flex flex-col items-center gap-1"
    >
      <div
        className="relative"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 100 100" width={size} height={size}>
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-slate-200"
            strokeWidth="9"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            className={RING_COLOR_CLASS[state]}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold tabular-nums text-slate-900">
            {rounded}
          </span>
        </div>
      </div>
      <span
        aria-hidden="true"
        className={`text-xs font-medium ${
          state === "stable"
            ? "text-emerald-700"
            : state === "moderate"
              ? "text-amber-700"
              : "text-red-700"
        }`}
      >
        {STATE_GLYPH[state]} {levelLabel}
      </span>
    </div>
  );
}
