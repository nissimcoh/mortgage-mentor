"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n/config";
// Type-only import: erased at compile time, keeps the server-only
// dictionary module out of the client bundle.
import type { Dictionary } from "@/app/[locale]/dictionaries";

type NavLabels = Dictionary["nav"];

interface BottomNavProps {
  locale: Locale;
  labels: NavLabels;
}

/** Mobile-only tab bar. Desktop keeps top navigation only (see AppHeader). */
export default function BottomNav({ locale, labels }: BottomNavProps) {
  const pathname = usePathname();

  const items = [
    { href: `/${locale}`, label: labels.home, glyph: "⌂" },
    { href: `/${locale}/calculator`, label: labels.calculator, glyph: "₪" },
    { href: `/${locale}/learn`, label: labels.bottomNavLearn, glyph: "✎" },
    { href: `/${locale}/saved`, label: labels.saved, glyph: "☆" },
  ];

  function isActive(href: string): boolean {
    if (href === `/${locale}`) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const activeIndex = items.findIndex((item) => isActive(item.href));

  return (
    // The glass surface includes the iOS home-indicator safe area.
    <nav
      aria-label={labels.ariaLabel}
      className="glass-nav fixed inset-x-0 bottom-0 z-40 rounded-t-3xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="relative mx-auto flex max-w-6xl">
        {/* One highlight that slides to the active tab instead of each tab
            toggling its own background. */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-1.5 px-3 transition-[inset-inline-start,opacity] duration-300 ease-out ${activeIndex < 0 ? "opacity-0" : ""}`}
          style={{ width: `${100 / items.length}%`, insetInlineStart: `${(Math.max(0, activeIndex) * 100) / items.length}%` }}
        >
          <span className="glass-active block h-full rounded-2xl" />
        </span>
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 transition-transform active:scale-95"
            >
              <span
                className={`flex flex-col items-center gap-0.5 px-4 py-1 text-xs transition-colors duration-300 ${
                  active ? "font-medium text-accent" : "text-slate-500"
                }`}
              >
                <span aria-hidden className={`text-lg leading-none transition-transform duration-300 ${active ? "-translate-y-0.5 scale-110" : ""}`}>
                  {item.glyph}
                </span>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
