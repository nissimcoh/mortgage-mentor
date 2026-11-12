"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n/config";
// Type-only import: erased at compile time, keeps the server-only
// dictionary module out of the client bundle.
import type { Dictionary } from "@/app/[locale]/dictionaries";
import Icon, { type IconName } from "./Icon";

type NavLabels = Dictionary["nav"];

interface BottomNavProps {
  locale: Locale;
  labels: NavLabels;
}

/** Mobile-only tab bar. Desktop keeps top navigation only (see AppHeader). */
export default function BottomNav({ locale, labels }: BottomNavProps) {
  const pathname = usePathname();

  const items: { href: string; label: string; icon: IconName }[] = [
    { href: `/${locale}`, label: labels.home, icon: "home" },
    { href: `/${locale}/calculator`, label: labels.calculator, icon: "calculator" },
    { href: `/${locale}/learn`, label: labels.bottomNavLearn, icon: "book" },
    { href: `/${locale}/saved`, label: labels.saved, icon: "bookmark" },
  ];

  function isActive(href: string): boolean {
    if (href === `/${locale}`) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const activeIndex = items.findIndex((item) => isActive(item.href));

  return (
    // A floating capsule above the iOS home indicator. AppShell reserves the
    // matching space at the end of the page so it never covers content.
    <nav
      aria-label={labels.ariaLabel}
      className="tab-bar fixed inset-x-3 z-40 mx-auto max-w-md md:hidden"
      style={{ bottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
    >
      <div className="relative flex p-1">
        {/* One highlight that slides to the active tab instead of each tab
            toggling its own background. */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-1 transition-[inset-inline-start,opacity] duration-300 ease-out ${activeIndex < 0 ? "opacity-0" : ""}`}
          style={{
            width: `calc((100% - 0.5rem) / ${items.length})`,
            insetInlineStart: `calc(0.25rem + (100% - 0.5rem) * ${Math.max(0, activeIndex)} / ${items.length})`,
          }}
        >
          <span className="block h-full rounded-full bg-black/[.06]" />
        </span>
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10.5px] transition-[color,transform] duration-200 active:scale-95 ${
                active ? "font-semibold text-accent" : "font-medium text-slate-500"
              }`}
            >
              <Icon name={item.icon} size={22} strokeWidth={active ? 1.9 : 1.6} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
