import type { Dictionary } from "@/app/[locale]/dictionaries";
import MarketHeading from "./MarketHeading";

export default function MarketSnapshotSkeleton({ labels, eyebrow }: { labels: Dictionary["market"]; eyebrow?: string }) {
  return (
    <div aria-busy="true">
      <MarketHeading labels={labels} eyebrow={eyebrow} />
      <p role="status" className="sr-only">{labels.loading}</p>
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((tile) => (
            <div key={tile} className="glass-panel min-h-44 p-5 sm:min-h-56 sm:p-7">
              <div className="h-3 w-24 rounded-full bg-slate-200" />
              <div className="mt-5 h-10 w-28 rounded-xl bg-slate-200 sm:h-14" />
              <div className="mt-6 h-3 w-3/4 rounded-full bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="mt-4 h-4 w-48 rounded-full bg-slate-200" />
        <div className="glass-track mt-4 h-12" />
      </div>
    </div>
  );
}
