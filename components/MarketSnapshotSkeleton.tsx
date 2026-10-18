import type { Dictionary } from "@/app/[locale]/dictionaries";

export default function MarketSnapshotSkeleton({ labels }: { labels: Dictionary["market"] }) {
  return (
    <div aria-busy="true">
      <h2 className="text-2xl font-bold tracking-tight">{labels.title}</h2>
      <p className="mb-6 mt-2 max-w-3xl text-sm leading-6 text-slate-600">{labels.subtitle}</p>
      <p role="status" className="mb-4 text-sm text-slate-500">{labels.loading}</p>
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((card) => (
            <div key={card} className="glass-panel min-h-72 p-5 sm:p-6">
              <div className="h-4 w-32 rounded bg-slate-200" />
              <div className="mt-4 h-10 w-24 rounded bg-slate-200" />
              <div className="mt-5 h-3 w-3/4 rounded bg-slate-200" />
              <div className="mt-3 h-3 w-1/2 rounded bg-slate-200" />
              <div className="mt-8 h-12 rounded bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="glass-panel mt-4 min-h-64 p-5 sm:p-6">
          <div className="h-5 w-48 rounded bg-slate-200" />
          <div className="mt-5 h-7 w-32 rounded bg-slate-200" />
          <div className="mt-5 h-3 w-3/4 rounded bg-slate-200" />
          <div className="mt-3 h-3 w-1/2 rounded bg-slate-200" />
        </div>
      </div>
    </div>
  );
}
