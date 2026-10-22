import type { Dictionary } from "@/app/[locale]/dictionaries";
import { RULE_METERS, RuleMeter } from "@/components/RuleCardContent";
import { TRACK_COLORS } from "@/lib/ui/track-colors";

type Visuals = Dictionary["learnPage"]["visuals"];

const [TEAL, GOLD, BLUE] = TRACK_COLORS;

// Illustration inputs for the repayment-method columns: 100,000 at 5% over 20 years.
const PRINCIPAL = 100_000;
const MONTHLY_RATE = 0.05 / 12;
const MONTHS = 240;

/** Yearly principal and interest for a Spitzer or equal-principal loan. */
function yearlySplit(method: "spitzer" | "equalPrincipal") {
  const payment = (PRINCIPAL * MONTHLY_RATE) / (1 - (1 + MONTHLY_RATE) ** -MONTHS);
  const years = Array.from({ length: MONTHS / 12 }, () => ({ principal: 0, interest: 0 }));
  let balance = PRINCIPAL;
  for (let month = 0; month < MONTHS; month++) {
    const interest = balance * MONTHLY_RATE;
    const principal = method === "spitzer" ? payment - interest : PRINCIPAL / MONTHS;
    years[Math.floor(month / 12)].principal += principal;
    years[Math.floor(month / 12)].interest += interest;
    balance -= principal;
  }
  return years;
}

// Both methods share one scale so the reader can compare them across cards.
const SPLITS = { spitzer: yearlySplit("spitzer"), equalPrincipal: yearlySplit("equalPrincipal") };
const SPLIT_MAX = Math.max(...Object.values(SPLITS).flat().map((year) => year.principal + year.interest));

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Column with a square baseline and rounded data end (r = 1.5 in plot units). */
function columnPath(x: number, top: number, width: number, height: number, rounded: boolean) {
  if (!rounded || height < 2) return `M${x},${top + height}V${top}h${width}V${top + height}Z`;
  return `M${x},${top + height}V${top + 1.5}q0,-1.5 1.5,-1.5h${width - 3}q1.5,0 1.5,1.5V${top + height}Z`;
}

function RepaymentColumns({ method, labels }: { method: keyof typeof SPLITS; labels: Visuals }) {
  const years = SPLITS[method];
  const plotHeight = 60;
  return (
    <figure className="mt-4">
      <div dir="ltr">
        <svg viewBox="0 0 200 64" className="w-full" role="img" aria-label={labels.repaymentCaption}>
          <line x1="0" x2="200" y1="62.5" y2="62.5" stroke="#e2e8f0" strokeWidth="1" />
          {years.map((year, index) => {
            const principalHeight = (year.principal / SPLIT_MAX) * plotHeight;
            const interestHeight = (year.interest / SPLIT_MAX) * plotHeight;
            const x = index * 10 + 1.5;
            const principalTop = 62 - principalHeight;
            return (
              <g key={index} className="mm-fade" style={{ animationDelay: `${index * 0.025}s` }}>
                <path d={columnPath(x, principalTop, 7, principalHeight, false)} fill={TEAL} />
                <path d={columnPath(x, principalTop - 1 - interestHeight, 7, interestHeight, true)} fill={GOLD} />
              </g>
            );
          })}
        </svg>
        <div className="flex justify-between text-[10px] text-slate-500"><span>{labels.yearFirst}</span><span>{labels.yearLast}</span></div>
      </div>
      <Legend items={[{ color: TEAL, label: labels.principal }, { color: GOLD, label: labels.interest }]} />
      <figcaption className="mt-1 text-xs text-slate-500">{labels.repaymentCaption}</figcaption>
    </figure>
  );
}

const BASKETS: { share: number; color: string }[][] = [
  [{ share: 1, color: TEAL }],
  [{ share: 1 / 3, color: TEAL }, { share: 1 / 3, color: GOLD }, { share: 1 / 3, color: BLUE }],
  [{ share: 1 / 2, color: TEAL }, { share: 1 / 2, color: GOLD }],
];

function BasketBars({ labels }: { labels: Visuals }) {
  return (
    <figure className="mt-4">
      <ul className="space-y-2" aria-hidden="true">
        {BASKETS.map((segments, index) => (
          <li key={index} className="flex items-center gap-3">
            <span className="w-10 shrink-0 text-xs text-slate-600">{labels.basket} {index + 1}</span>
            <span className="flex h-3 flex-1 gap-[2px] overflow-hidden rounded-full">
              {segments.map((segment, segmentIndex) => (
                <span key={segmentIndex} className="mm-grow-x h-full ltr:origin-left rtl:origin-right"
                  style={{ width: `${segment.share * 100}%`, backgroundColor: segment.color, animationDelay: `${index * 0.1}s` }} />
              ))}
            </span>
          </li>
        ))}
      </ul>
      <Legend items={[{ color: TEAL, label: labels.fixedUnlinked }, { color: GOLD, label: labels.prime }, { color: BLUE, label: labels.variableLinked }]} />
    </figure>
  );
}

function PrimeBar({ labels }: { labels: Visuals }) {
  return (
    <figure className="mt-4">
      <span aria-hidden="true" className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        <span className="mm-grow-x h-full ltr:origin-left rtl:origin-right" style={{ width: `${(3 / 4.5) * 100}%`, backgroundColor: TEAL }} />
        <span className="mm-grow-x h-full ltr:origin-left rtl:origin-right" style={{ width: `${(1.5 / 4.5) * 100}%`, backgroundColor: GOLD, animationDelay: ".15s" }} />
      </span>
      <Legend items={[{ color: TEAL, label: labels.boiRate }, { color: GOLD, label: labels.primeMargin }]} />
      <figcaption className="mt-1 text-xs text-slate-500">{labels.primeCaption}</figcaption>
    </figure>
  );
}

/** A small explanatory figure for terms that read better as a picture; null for the rest. */
export default function TermVisual({ id, labels }: { id: string; labels: Visuals }) {
  if (id === "term-11") return <RepaymentColumns method="spitzer" labels={labels} />;
  if (id === "term-12") return <RepaymentColumns method="equalPrincipal" labels={labels} />;
  if (id === "term-reg-baskets") return <BasketBars labels={labels} />;
  if (id === "term-4") return <PrimeBar labels={labels} />;
  const meter = RULE_METERS[id];
  return meter ? <div className="mt-4"><RuleMeter {...meter} /></div> : null;
}
