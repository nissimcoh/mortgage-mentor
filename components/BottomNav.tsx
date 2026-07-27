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
    { href: `/${locale}/compare`, label: labels.bottomNavCompare, glyph: "⇄" },
    { href: `/${locale}/saved`, label: labels.saved, glyph: "☆" },
  ];

  function isActive(href: string): boolean {
    if (href === `/${locale}`) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    // A fully opaque bg (no /alpha, no backdrop-blur) so nothing beneath —
    // including the safe-area strip below the tab bar itself — can ever
    // show through. paddingBottom (inside this same opaque box, so the
    // color extends all the way into it) reserves the iOS home-indicator
    // area; it only resolves to a real value because `viewportFit: "cover"`
    // is set in layout.tsx's `viewport` export.
    <nav
      aria-label={labels.ariaLabel}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white shadow-[0_-2px_10px_rgba(15,23,42,0.05)] md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-6xl">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5"
            >
              <span
                className={`flex flex-col items-center gap-0.5 rounded-xl px-4 py-1 text-xs transition ${
                  active
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-500"
                }`}
              >
                <span aria-hidden className="text-lg leading-none">
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
