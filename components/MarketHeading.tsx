import type { Dictionary } from "@/app/[locale]/dictionaries";

/** Shared by the loaded market section and its skeleton so the heading never shifts. */
export default function MarketHeading({ labels, eyebrow }: { labels: Dictionary["market"]; eyebrow?: string }) {
  return (
    <div className="mb-8 max-w-3xl sm:mb-12">
      {eyebrow && <p className="text-sm font-semibold text-accent">{eyebrow}</p>}
      <h2 className="mt-1.5 text-3xl font-semibold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl">{labels.title}</h2>
      <p className="mt-3 text-base leading-7 text-slate-500 sm:text-lg">{labels.subtitle}</p>
    </div>
  );
}
