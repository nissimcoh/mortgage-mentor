import type { Locale } from "@/lib/i18n/config";
import ShareImageFrame from "./ShareImageFrame";

export interface ComparisonImageColumn {
  name: string;
  color: string;
}

export interface ComparisonImageRow {
  label: string;
  values: string[];
  /** Column marked as the best value in this row, if any. */
  best?: number | null;
}

/**
 * Two or three options side by side: a headline card per option, the
 * figures row by row, and plain-language takeaways under them.
 */
export default function ComparisonImage({ locale, title, subtitle, columns, headline, rows, takeaways, note, siteName, createdOn }: {
  locale: Locale;
  title: string;
  subtitle?: string | null;
  columns: ComparisonImageColumn[];
  /** The figure printed large on each option's card, with its label. */
  headline: { label: string; values: string[] };
  rows: ComparisonImageRow[];
  takeaways: string[];
  note: string;
  siteName: string;
  createdOn: string;
}) {
  const grid = { gridTemplateColumns: `260px repeat(${columns.length}, minmax(0, 1fr))` };
  return (
    <ShareImageFrame locale={locale} title={title} subtitle={subtitle} note={note} createdOn={createdOn} siteName={siteName}>
      <section className="grid gap-5" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((column, index) => (
          <article key={index} className="overflow-hidden rounded-3xl bg-white shadow-sm">
            <div className="h-2" style={{ backgroundColor: column.color }} />
            <div className="px-7 py-6">
              <p className="flex items-center gap-3 text-[22px] font-semibold leading-snug">
                <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: column.color }} />
                <bdi className="min-w-0 break-words">{column.name}</bdi>
              </p>
              <p className="mt-5 text-base text-slate-500">{headline.label}</p>
              <p className="mt-1 text-[44px] font-bold leading-none tracking-tight tabular-nums"><span dir="auto" className="inline-block">{headline.values[index]}</span></p>
            </div>
          </article>
        ))}
      </section>

      <section className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm">
        {rows.map((row, rowIndex) => (
          <div key={row.label} className={`grid items-center gap-4 px-7 py-4 text-lg ${rowIndex > 0 ? "border-t border-slate-100" : ""}`} style={grid}>
            <span className="text-slate-500">{row.label}</span>
            {row.values.map((value, index) => (
              <span key={index} className="flex items-center gap-2 font-semibold tabular-nums">
                <span dir="auto">{value}</span>
                {row.best === index && <span className="text-[#00897b]" aria-hidden="true">✓</span>}
              </span>
            ))}
          </div>
        ))}
      </section>

      {takeaways.length > 0 && (
        <section className="mt-6 rounded-3xl bg-[#102f40] px-8 py-6 text-white">
          <ul className="space-y-2.5 text-xl leading-8">
            {takeaways.map((text) => (
              <li key={text} className="flex gap-3">
                <span className="mt-3 h-2 w-2 shrink-0 rounded-full bg-[#5fd3c4]" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </ShareImageFrame>
  );
}
