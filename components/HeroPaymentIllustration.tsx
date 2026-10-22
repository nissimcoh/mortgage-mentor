import type { Dictionary } from "@/app/[locale]/dictionaries";
import { revealDelay } from "@/lib/ui/reveal-delay";

// A hand-drawn shape, not calculator output: the payment starts at the first
// payment, climbs to a forecast peak, eases down and steps when a track ends.
const LINE = "M12 96 C 52 90, 82 44, 122 40 S 196 56, 236 62 L 248 84 C 270 86, 292 88, 308 88";
const AREA = `${LINE} L 308 132 L 12 132 Z`;
const MARKERS = [
  { x: 12, y: 96, pulse: false },
  { x: 122, y: 40, pulse: true },
  { x: 168, y: 104, pulse: false },
];

export default function HeroPaymentIllustration({ labels }: { labels: Dictionary["home"] }) {
  return (
    <aside className="glass-hero mm-reveal p-6 sm:p-7" style={revealDelay(0.15)} aria-labelledby="overview-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="overview-title" className="text-lg font-bold">{labels.overviewTitle}</h2>
        <span className="shrink-0 text-xs text-slate-500">{labels.overviewNote}</span>
      </div>
      <div dir="ltr" className="mt-4">
        <svg viewBox="0 0 320 140" className="w-full" role="img" aria-label={labels.overviewChartLabel}>
          <defs>
            <linearGradient id="hero-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#0f6e68" stopOpacity=".28" />
              <stop offset="100%" stopColor="#0f6e68" stopOpacity=".02" />
            </linearGradient>
          </defs>
          {[44, 88, 132].map((y) => <line key={y} x1="12" x2="308" y1={y} y2={y} stroke="#0f6e68" strokeOpacity=".1" />)}
          <path d={AREA} fill="url(#hero-area)" className="mm-fade" style={revealDelay(1.1)} />
          <path d={LINE} pathLength={1} fill="none" stroke="#0f6e68" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mm-draw" />
          {MARKERS.map((marker, index) => (
            <g key={index} className="mm-pop" style={revealDelay(1.2 + index * 0.35)}>
              {marker.pulse && <circle cx={marker.x} cy={marker.y} r="11" fill="#ab8a52" className="mm-pulse" />}
              <circle cx={marker.x} cy={marker.y} r="10" fill={index === 1 ? "#ab8a52" : "#0f6e68"} stroke="#fff" strokeWidth="2" />
              <text x={marker.x} y={marker.y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">{index + 1}</text>
            </g>
          ))}
        </svg>
        <div className="flex justify-between px-1 text-[11px] text-slate-500">
          <span>{labels.overviewAxisStart}</span>
          <span>{labels.overviewAxisEnd}</span>
        </div>
      </div>
      <ol className="mt-4 space-y-3">
        {labels.overviewItems.map((item, index) => (
          <li key={item.title} className="flex items-start gap-3">
            <span aria-hidden="true" className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${index === 1 ? "bg-accent-luxe" : "bg-accent"}`}>{index + 1}</span>
            <p className="text-sm leading-6 text-slate-600"><span className="font-semibold text-slate-900">{item.title}</span> · {item.body}</p>
          </li>
        ))}
      </ol>
    </aside>
  );
}
