import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import { legalLabels } from "@/lib/legal/labels";
import { legalOperator } from "@/lib/legal/config";

export default function SiteFooter({ locale }: { locale: Locale }) {
  const text = legalLabels[locale];
  return (
    <footer className="mx-auto mt-8 max-w-6xl border-t border-slate-200 px-6 py-8 text-sm leading-6 text-slate-600">
      <p>{text.note}</p>
      <nav aria-label={text.navigation} className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
        {(["privacy", "terms", "accessibility"] as const).map((page) => (
          <Link key={page} href={`/${locale}/${page}`} className="underline underline-offset-4 hover:text-slate-900">{text[page]}</Link>
        ))}
        {legalOperator.email && <a href={`mailto:${legalOperator.email}`} className="underline underline-offset-4 hover:text-slate-900">{text.support}</a>}
      </nav>
    </footer>
  );
}
