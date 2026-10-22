import type { Dictionary } from "@/app/[locale]/dictionaries";

type Rule = Dictionary["learnPage"]["rules"][number];

// Rules that are a ratio against a limit get a meter: the fill is the cap,
// the optional mark is where banks start getting stricter.
export const RULE_METERS: Record<string, { fill: number; mark?: number }> = {
  "term-reg-ltv": { fill: 0.75 },
  "term-reg-pti": { fill: 0.5, mark: 0.4 },
  "term-reg-fixed-share": { fill: 1 / 3 },
};

/** Same-ramp meter: accent fill on its own light step, optional threshold tick. */
export function RuleMeter({ fill, mark }: { fill: number; mark?: number }) {
  return (
    <span aria-hidden="true" className={`relative block h-2 rounded-full bg-accent-soft ${mark === undefined ? "" : "mb-3"}`}>
      <span className="mm-grow block h-full rounded-full bg-accent ltr:origin-left rtl:origin-right" style={{ width: `${fill * 100}%` }} />
      {mark !== undefined && (
        <span className="absolute -top-1 bottom-[-4px] w-px bg-slate-500" style={{ insetInlineStart: `${mark * 100}%` }}>
          <span className="absolute top-full mt-0.5 -translate-x-1/2 text-[10px] leading-none text-slate-500 rtl:translate-x-1/2">{Math.round(mark * 100)}%</span>
        </span>
      )}
    </span>
  );
}

/** Card body shared by the home strip and the learn page; the caller owns the link. */
export default function RuleCardContent({ rule }: { rule: Rule }) {
  const meter = RULE_METERS[rule.termId];
  return (
    <span className="flex w-full flex-col gap-3">
      <span className="flex items-center gap-4">
        <span className="min-w-12 text-2xl font-bold tracking-tight text-accent sm:text-3xl"><bdi>{rule.value}</bdi></span>
        <span className="text-sm leading-6 text-slate-700">{rule.label}</span>
      </span>
      {meter && <RuleMeter {...meter} />}
    </span>
  );
}
