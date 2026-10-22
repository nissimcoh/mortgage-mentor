import type { Dictionary } from "@/app/[locale]/dictionaries";

export default function MarketSnapshotSkeleton({ labels }: { labels: Dictionary["market"] }) {
  return (
    <div aria-busy="true">
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{labels.title}</h2>
      <p className="mb-5 mt-1 max-w-3xl text-sm leading-6 text-slate-600">{labels.subtitle}</p>
      <p role="status" className="mb-4 text-sm text-slate-500">{labels.loading}</p>
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((tile) => (
            <div key={tile} className="glass-panel min-h-32 p-4 sm:p-5">
              <div className="h-3 w-24 rounded bg-slate-200" />
              <div className="mt-4 h-8 w-20 rounded bg-slate-200" />
              <div className="mt-4 h-3 w-3/4 rounded bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="mt-3 h-4 w-48 rounded bg-slate-200" />
        <div className="glass-track mt-4 h-11" />
      </div>
    </div>
  );
}
