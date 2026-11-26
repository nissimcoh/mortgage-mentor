import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { fillTemplate, formatIsoDate, formatMoney } from "@/lib/payoff-report/present";
import { KIND_COLORS, cardColumns, type MortgageSummaryData } from "@/lib/share-image/summary";
import ShareImageFrame from "./ShareImageFrame";

type Labels = Dictionary["shareImage"];

function monthLabel(month: string | null): string {
  if (month === null) return "";
  const [year, number] = month.split("-");
  return `${number}/${year}`;
}

/** The "my mortgage" summary: totals on top, then a card per track. */
export default function MortgageSummaryImage({ data, locale, labels, kindNames, siteName, createdOn }: {
  data: MortgageSummaryData;
  locale: Locale;
  labels: Labels;
  kindNames: Dictionary["payoffPage"]["forecastKinds"];
  siteName: string;
  createdOn: string;
}) {
  const money = (value: number) => formatMoney(value, locale);
  const percent = (value: number) => `${value.toFixed(2)}%`;
  const columns = cardColumns(data.tracks.length);
  const subtitle = [
    data.bankNames.join(" · "),
    data.asOfDates.length > 0 ? fillTemplate(labels.asOf, { date: data.asOfDates.map(formatIsoDate).join(", ") }) : "",
  ].filter(Boolean).join(" · ");

  const headline: [string, string][] = [
    ...(data.fees !== null ? [[labels.fees, money(data.fees)] as [string, string]] : []),
    ...(data.monthlyPayment !== null ? [[labels.monthly, money(data.monthlyPayment)] as [string, string]] : []),
    [labels.totalPayment, money(data.totalPayment)],
    ...(data.lastMonth ? [[labels.ends, monthLabel(data.lastMonth)] as [string, string]] : []),
  ];

  return (
    <ShareImageFrame locale={locale} title={labels.summaryTitle} subtitle={subtitle} note={labels.footerNote}
      createdOn={createdOn} siteName={siteName}>
      <section className="rounded-3xl bg-[#102f40] px-10 py-8 text-white">
        <p className="text-xl text-white/70">{labels.totalToSettle}</p>
        <p className="mt-1 text-[64px] font-bold leading-none tracking-tight tabular-nums">
          <span dir="ltr" className="inline-block">{data.totalToSettle !== null ? money(data.totalToSettle) : "—"}</span>
        </p>
        <dl className="mt-7 grid grid-cols-4 gap-4 border-t border-white/15 pt-6">
          {headline.map(([label, value]) => (
            <div key={label}>
              <dt className="text-base text-white/65">{label}</dt>
              <dd className="mt-1 text-[26px] font-semibold tabular-nums"><span dir="ltr" className="inline-block">{value}</span></dd>
            </div>
          ))}
        </dl>
      </section>

      {data.composition.length > 0 && (
        <section className="mt-6 rounded-3xl bg-white px-8 py-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-700">{labels.composition}</h2>
          <div dir="ltr" className="mt-3 flex h-4 overflow-hidden rounded-full">
            {data.composition.map((part) => (
              <span key={part.kind} style={{ width: `${part.share * 100}%`, backgroundColor: KIND_COLORS[part.kind] }} />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-base">
            {data.composition.map((part) => (
              <li key={part.kind} className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: KIND_COLORS[part.kind] }} />
                {kindNames[part.kind]} <span className="font-semibold tabular-nums">{Math.round(part.share * 100)}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 grid gap-5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {data.tracks.map((track, index) => {
          const lines: [string, string][] = [
            ...(track.principal !== null ? [[labels.principal, money(track.principal)] as [string, string]] : []),
            ...(track.ratePercent !== null ? [[labels.rate, percent(track.ratePercent)] as [string, string]] : []),
            ...(track.nextResetDate ? [[labels.nextReset, formatIsoDate(track.nextResetDate)] as [string, string]] : []),
            ...(track.monthlyPayment !== null ? [[labels.payment, money(track.monthlyPayment)] as [string, string]] : []),
            [labels.lastPayment, formatIsoDate(track.lastPaymentDate)],
            [labels.remaining, String(track.remainingPayments)],
          ];
          return (
            <article key={index} className="overflow-hidden rounded-3xl bg-white shadow-sm">
              <div className={`${columns === 4 ? "px-5" : "px-6"} py-4 text-white`} style={{ backgroundColor: KIND_COLORS[track.kind] }}>
                <p className="text-lg font-semibold leading-snug">{kindNames[track.kind]}</p>
                <p className="mt-0.5 text-[15px] text-white/85">
                  {[track.loanTail && fillTemplate(labels.loan, { tail: track.loanTail }), track.label].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className={columns === 4 ? "px-5 py-5" : "px-6 py-5"}>
                <p className="text-[30px] font-bold tracking-tight tabular-nums">
                  <span dir="ltr" className="inline-block">{track.totalToSettle !== null ? money(track.totalToSettle) : "—"}</span>
                </p>
                <dl className={`mt-4 space-y-2 ${columns === 4 ? "text-[15px]" : "text-base"}`}>
                  {lines.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3 border-t border-slate-100 pt-2">
                      <dt className="whitespace-nowrap text-slate-500">{label}</dt>
                      <dd dir="ltr" className="font-semibold tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </article>
          );
        })}
      </section>
    </ShareImageFrame>
  );
}
