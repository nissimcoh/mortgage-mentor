/**
 * Shown the instant a visitor taps a link to the calculator, while the server
 * renders the real page (rates and forecast curves are read per request).
 * Next.js prefetches this file, so the tap is answered without a round trip.
 * It mirrors the real layout: title block, then the form card with one track.
 */
export default function CalculatorLoading() {
  const field = "h-11 rounded-xl bg-slate-100";
  return (
    <main className="text-slate-900" aria-busy="true">
      <section className="mx-auto max-w-6xl px-4 pt-8 pb-14 sm:px-6 sm:pt-14">
        <div aria-hidden="true" className="motion-safe:animate-pulse">
          <div className="h-4 w-28 rounded-full bg-slate-200" />
          <div className="mt-5 h-10 w-64 max-w-full rounded-2xl bg-slate-200 sm:h-14 sm:w-96" />
          <div className="mt-5 h-5 w-full max-w-2xl rounded-full bg-slate-200" />
          <div className="mt-3 mb-8 h-4 w-3/4 max-w-xl rounded-full bg-slate-200" />
          <div className="glass-panel p-4 sm:p-7">
            <div className="mb-5 flex justify-between border-b border-slate-100 pb-4">
              <div className="h-4 w-28 rounded-full bg-slate-100" />
              <div className="h-4 w-40 rounded-full bg-slate-100" />
            </div>
            <div className="glass-track p-4 sm:p-5">
              <div className="h-4 w-20 rounded-full bg-slate-200" />
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[0, 1, 2, 3, 4].map((index) => <div key={index} className={field} />)}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <div className="h-12 w-44 rounded-full bg-slate-200" />
              <div className="h-11 w-32 rounded-full bg-slate-100" />
              <div className="h-11 w-28 rounded-full bg-slate-100" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
