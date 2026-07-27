"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n/config";
// Type-only import: erased at compile time, keeps the server-only
// dictionary module out of the client bundle.
import type { Dictionary } from "@/app/[locale]/dictionaries";
import BrandMark from "./BrandMark";
import LanguageSwitcher from "./LanguageSwitcher";

type NavLabels = Dictionary["nav"];

interface AppHeaderProps {
  locale: Locale;
  labels: NavLabels;
}

export default function AppHeader({ locale, labels }: AppHeaderProps) {
  const pathname = usePathname();

  const navItems = [
    { href: `/${locale}`, label: labels.home },
    { href: `/${locale}/calculator`, label: labels.calculator },
    { href: `/${locale}/compare`, label: labels.compare },
    { href: `/${locale}/saved`, label: labels.saved },
  ];

  function isActive(href: string): boolean {
    if (href === `/${locale}`) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    // Sticky, not fixed: it reserves its own space in normal flow, so page
    // content never has to guess how tall it is to avoid sitting under it.
    // paddingTop covers the iOS notch/Dynamic Island once viewportFit:
    // "cover" (set in layout.tsx) makes that inset resolve to a real value.
    <header
      className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href={`/${locale}`} className="flex items-center gap-2">
          <BrandMark />
          <span className="flex flex-col leading-tight">
            <span className="text-lg font-bold tracking-tight text-slate-900">
              {labels.appName}
            </span>
            {labels.appNameLocalized && (
              <span className="text-xs text-slate-500">
                {labels.appNameLocalized}
              </span>
            )}
          </span>
        </Link>

        <nav
          aria-label={labels.ariaLabel}
          className="hidden items-center gap-1 md:flex"
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive(item.href)
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          {/* useSearchParams (inside LanguageSwitcher) needs a Suspense
              boundary on statically prerendered routes; scoped tightly here
              so it never gates the rest of the page/shell. */}
          <Suspense fallback={null}>
            <LanguageSwitcher />
          </Suspense>
          <Link
            href={`/${locale}/signin`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            {labels.signIn}
          </Link>
        </div>
      </div>
    </header>
  );
}
