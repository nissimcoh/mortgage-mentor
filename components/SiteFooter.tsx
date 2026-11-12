import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import { legalLabels } from "@/lib/legal/labels";
import { legalOperator } from "@/lib/legal/config";
import BrandMark from "./BrandMark";

export default function SiteFooter({ locale, nav }: { locale: Locale; nav: Dictionary["nav"] }) {
  const text = legalLabels[locale];
  const linkClass = "text-slate-600 transition-colors hover:text-slate-900 hover:underline hover:underline-offset-4";
  return (
    <footer className="mt-16 border-t border-black/[.07] text-[13px] leading-6 text-slate-500">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <Link href={`/${locale}`} className="inline-flex items-center gap-2 text-slate-900">
              <BrandMark className="h-6 w-6" />
              <span dir="ltr" className="text-sm font-semibold tracking-tight">{nav.appName}</span>
            </Link>
            <p className="mt-3 max-w-sm">{text.note}</p>
          </div>
          <nav aria-label={nav.ariaLabel}>
            <p className="font-semibold text-slate-900">{nav.footerProduct}</p>
            <ul className="mt-2 space-y-1.5">
              <li><Link href={`/${locale}/calculator`} className={linkClass}>{nav.calculator}</Link></li>
              <li><Link href={`/${locale}/learn`} className={linkClass}>{nav.learn}</Link></li>
              <li><Link href={`/${locale}/saved`} className={linkClass}>{nav.saved}</Link></li>
            </ul>
          </nav>
          <nav aria-label={text.navigation}>
            <p className="font-semibold text-slate-900">{nav.footerInfo}</p>
            <ul className="mt-2 space-y-1.5">
              {(["privacy", "terms", "accessibility"] as const).map((page) => (
                <li key={page}><Link href={`/${locale}/${page}`} className={linkClass}>{text[page]}</Link></li>
              ))}
              {legalOperator.email && <li><a href={`mailto:${legalOperator.email}`} className={linkClass}>{text.support}</a></li>}
            </ul>
          </nav>
        </div>
        <p className="mt-8 border-t border-black/[.07] pt-5 text-xs text-slate-500">
          <span dir="ltr">© {nav.appName}</span> · {nav.footerSources}
        </p>
      </div>
    </footer>
  );
}
