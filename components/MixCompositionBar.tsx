import { TRACK_COLORS } from "@/lib/ui/track-colors";
import { revealDelay } from "@/lib/ui/reveal-delay";

/**
 * Part-to-whole bar of the mix: one segment per track in its fixed track
 * color, separated by a 2px surface gap, with a legend carrying the label,
 * amount and share so identity never depends on color alone.
 */
export default function MixCompositionBar({ title, items }: {
  title: string;
  items: { label: string; amount: string; share: string; fraction: number }[];
}) {
  return (
    <figure className="mt-5 border-t border-slate-900/10 pt-4">
      <figcaption className="text-sm font-medium text-slate-600">{title}</figcaption>
      <div aria-hidden="true" className="mt-3 flex h-3 gap-[2px] overflow-hidden rounded-full">
        {items.map((item, index) => (
          <span key={item.label} className="mm-grow-x h-full ltr:origin-left rtl:origin-right"
            style={{ width: `${item.fraction * 100}%`, backgroundColor: TRACK_COLORS[index], ...revealDelay(0.1 + index * 0.08) }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
        {items.map((item, index) => (
          <li key={item.label} className="flex items-center gap-2">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: TRACK_COLORS[index] }} />
            <span className="text-slate-700">{item.label}</span>
            <span className="tabular-nums text-slate-900">{item.amount}</span>
            <span className="tabular-nums text-slate-500">{item.share}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
