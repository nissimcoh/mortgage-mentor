"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import Icon from "./Icon";
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

/** Carries the current query string (e.g. calculator inputs) across a
 * language switch. Reading search params is what requires the Suspense
 * boundary in AppHeader, so it lives in this thin wrapper only. */
export function LanguageSwitcherWithQuery() {
  const searchParams = useSearchParams();
  return <LanguageSwitcher queryString={searchParams.toString()} />;
}

export default function LanguageSwitcher({ queryString }: { queryString: string }) {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const containerRef = useRef<HTMLDivElement>(null);

  const currentSegment = pathname.split("/")[1];
  const currentLocale = isValidLocale(currentSegment)
    ? currentSegment
    : defaultLocale;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpenPath(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPath(null);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    // dir="ltr" keeps the control's internal layout identical regardless of
    // the page's own direction. Positioned inline in the header now (not
    // floating over content) — `relative` just gives the dropdown below an
    // anchor to position against.
    <div ref={containerRef} dir="ltr" className="relative text-sm">
      <button
        type="button"
        onClick={() => setOpenPath(open ? null : pathname)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] text-slate-600 transition-colors hover:bg-black/5 hover:text-slate-900"
      >
        <Icon name="globe" size={17} />
        <span lang={currentLocale}>{localeLabels[currentLocale]}</span>
        <Icon name="chevron" size={11} strokeWidth={2.2} className={`hidden text-slate-400 transition-transform sm:block ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="glass-menu absolute left-1/2 top-full mt-2 min-w-32 -translate-x-1/2 overflow-hidden border p-1"
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
                onClick={() => setOpenPath(null)}
                className={`block rounded-xl px-4 py-2 text-center text-sm transition-colors ${
                  isActive
                    ? "bg-black/5 font-semibold text-slate-900"
                    : "text-slate-600 hover:bg-black/5"
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
