import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isValidLocale } from "@/lib/i18n/config";
import { formatDateOnly } from "@/lib/forms/dates";
import { legalContent, type LegalPageKind } from "@/lib/legal/content";
import { legalLabels } from "@/lib/legal/labels";
import { legalDetailsComplete, legalOperator, legalUpdatedAt } from "@/lib/legal/config";

export type LegalPageProps = { params: Promise<{ locale: string }> };

export async function legalMetadata(kind: LegalPageKind, { params }: LegalPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();
  return {
    title: `${legalLabels[locale][kind]} | MortgageMentor`,
    robots: legalDetailsComplete ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function LegalPage({ kind, params }: LegalPageProps & { kind: LegalPageKind }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();
  const he = locale === "he";
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10 text-slate-900 sm:py-14">
      <Link href={`/${locale}`} className="text-sm underline underline-offset-4">{he ? "חזרה לדף הבית" : "Back to home"}</Link>
      <article className="glass-panel mt-5 p-6 sm:p-10">
        <h1 className="text-3xl font-bold">{legalLabels[locale][kind]}</h1>
        <p className="mt-3 text-sm text-slate-600">{he ? "עדכון אחרון: " : "Last updated: "}<time dateTime={legalUpdatedAt}>{formatDateOnly(legalUpdatedAt, locale)}</time></p>
        {!legalDetailsComplete && (
          <p role="status" className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            {he ? "טיוטה — פרטי המפעיל ויצירת הקשר עדיין אינם מלאים. העמוד אינו מדיניות סופית לפרסום." : "Draft — operator and contact details are not yet complete. This page is not a final policy for publication."}
          </p>
        )}
        {legalDetailsComplete && (
          <section className="mt-6 rounded-xl border border-slate-200 p-4" aria-labelledby="operator-title">
            <h2 id="operator-title" className="font-semibold">{he ? "מפעיל האתר ופרטי קשר" : "Operator and contact"}</h2>
            <p className="mt-2">{legalOperator.name}</p>
            <p className="mt-1">{he ? "לפניות פרטיות, עיון, תיקון, מחיקה ועזרה: " : "For privacy, access, correction, deletion and assistance: "}<a dir="ltr" className="break-all underline underline-offset-4" href={`mailto:${legalOperator.email}`}>{legalOperator.email}</a></p>
          </section>
        )}
        <div className="mt-8 space-y-8">
          {legalContent[locale][kind].map((section) => (
            <section key={section.title}>
              <h2 className="mb-3 text-xl font-semibold">{section.title}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph} className="mt-3 text-base leading-8 text-slate-700">{paragraph}</p>)}
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
