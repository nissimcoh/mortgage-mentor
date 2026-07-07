"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  defaultLocale,
  isValidLocale,
  locales,
  type Locale,
} from "@/lib/i18n/config";

// Each language is labeled in its own language on purpose, so users who
// don't read the current one can still find their way back.
const localeLabels: Record<Locale, string> = {
  he: "עברית",
  en: "English",
};

function getPathForLocale(
  pathname: string,
  locale: Locale,
  queryString: string,
): string {
  const segments = pathname.split("/");
  const path = isValidLocale(segments[1])
    ? [segments[0], locale, ...segments.slice(2)].join("/")
    : `/${locale}${pathname === "/" ? "" : pathname}`;
  // Keep query params (e.g. calculator inputs) across language switches.
  return queryString ? `${path}?${queryString}` : path;
}

export default function LanguageSwitcher() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentSegment = pathname.split("/")[1];
  const currentLocale = isValidLocale(currentSegment)
    ? currentSegment
    : defaultLocale;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Close the menu after navigating to the other locale.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    // dir="ltr" keeps the control's internal layout identical on RTL and
    // LTR pages; the fixed top-center position is direction-neutral.
    <div
      ref={containerRef}
      dir="ltr"
      className="fixed left-1/2 top-4 z-50 -translate-x-1/2 text-sm"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        <span aria-hidden>🌐</span>
        <span lang={currentLocale}>{localeLabels[currentLocale]}</span>
        <span
          aria-hidden
          className={`text-xs text-slate-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-1/2 top-full mt-1 min-w-full -translate-x-1/2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md"
        >
          {locales.map((locale) => {
            const isActive = locale === currentLocale;
            return (
              <Link
                key={locale}
                role="menuitem"
                href={getPathForLocale(pathname, locale, queryString)}
                lang={locale}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`block px-4 py-2 text-center transition ${
                  isActive
                    ? "bg-slate-100 font-semibold text-slate-900"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {localeLabels[locale]}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
