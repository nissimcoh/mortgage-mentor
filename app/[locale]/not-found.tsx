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
      <div className="glass-panel p-8 text-center sm:p-14">
        <p className="text-7xl font-semibold tracking-tight text-slate-200 sm:text-8xl">404</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">{t.title}</h1>
        <p className="mt-3 text-lg leading-8 text-slate-500">{t.body}</p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href={`/${locale}/calculator`} className="glass-button inline-flex min-h-11 items-center justify-center px-6 text-[15px] font-medium text-white">{t.calculator}</Link>
          <Link href={`/${locale}`} className="glass-secondary inline-flex min-h-11 items-center justify-center px-6 text-[15px] font-medium">{t.home}</Link>
        </div>
      </div>
    </main>
  );
}
