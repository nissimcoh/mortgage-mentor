import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import { legalLabels } from "@/lib/legal/labels";

export default function LegalNotice({ locale, kind }: { locale: Locale; kind: "signin" | "save" }) {
  const text = legalLabels[locale];
  return (
    <div className="my-4 space-y-2 text-[13px] leading-6 text-slate-500">
      <p>{text[kind]}</p>
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        <Link className="text-accent hover:underline hover:underline-offset-4" href={`/${locale}/privacy`}>{text.privacy}</Link>
        <Link className="text-accent hover:underline hover:underline-offset-4" href={`/${locale}/terms`}>{text.terms}</Link>
      </p>
    </div>
  );
}
