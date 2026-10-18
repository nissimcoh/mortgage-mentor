"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { defaultLocale, isValidLocale } from "@/lib/i18n/config";

// not-found receives no params; the locale comes from the URL instead.
const text = {
  he: { title: "העמוד לא נמצא", body: "ייתכן שהקישור שגוי או שהעמוד הוסר.", home: "חזרה לדף הבית", calculator: "למחשבון המשכנתא" },
  en: { title: "Page not found", body: "The link may be wrong, or the page may have been removed.", home: "Back to home", calculator: "Open the calculator" },
};

export default function NotFound() {
  const segment = usePathname()?.split("/")[1] ?? "";
  const locale = isValidLocale(segment) ? segment : defaultLocale;
  const t = text[locale];
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16 text-slate-900 sm:py-24">
      <div className="glass-panel p-6 text-center sm:p-10">
        <p className="text-sm font-semibold tracking-wide text-accent">404</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-3 text-base leading-7 text-slate-600">{t.body}</p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href={`/${locale}/calculator`} className="glass-button rounded-xl px-5 py-3 text-sm font-semibold text-white">{t.calculator}</Link>
          <Link href={`/${locale}`} className="glass-secondary rounded-xl px-5 py-3 text-sm font-semibold">{t.home}</Link>
        </div>
      </div>
    </main>
  );
}
