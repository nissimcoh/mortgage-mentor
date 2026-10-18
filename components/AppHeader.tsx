"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n/config";
// Type-only import: erased at compile time, keeps the server-only
// dictionary module out of the client bundle.
import type { Dictionary } from "@/app/[locale]/dictionaries";
import BrandMark from "./BrandMark";
import HeaderAuthStatus from "./HeaderAuthStatus";
import LanguageSwitcher, { LanguageSwitcherWithQuery } from "./LanguageSwitcher";

type NavLabels = Dictionary["nav"];

interface AppHeaderProps {
  locale: Locale;
  labels: NavLabels;
  accountMenu: Dictionary["accountMenu"];
}

export default function AppHeader({ locale, labels, accountMenu }: AppHeaderProps) {
  const pathname = usePathname();

  const navItems = [
    { href: `/${locale}`, label: labels.home },
    { href: `/${locale}/calculator`, label: labels.calculator },
    { href: `/${locale}/learn`, label: labels.learn },
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
      className="glass-nav sticky top-0 z-40"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Below ~375px the brand, language switcher and account control
          don't all fit: tighter gaps plus a shrinkable (truncating) brand
          keep the header inside the viewport instead of pushing the
          controls off-screen and making every page scroll sideways. */}
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-3 sm:gap-4 sm:px-6">
        <Link href={`/${locale}`} className="flex min-w-0 items-center gap-2">
          <BrandMark className="shrink-0" />
          <span className="flex min-w-0 flex-col leading-tight">
            {/* Latin wordmark: LTR so any truncation clips its end. */}
            <span dir="ltr" className="truncate text-start text-base font-bold tracking-tight text-slate-900 sm:text-lg">
              {labels.appName}
            </span>
            {labels.appNameLocalized && (
              <span className="truncate text-xs text-slate-500">
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
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive(item.href)
                  ? "glass-active"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex shrink-0 items-center gap-2">
          {/* useSearchParams (inside LanguageSwitcher) needs a Suspense
              boundary on statically prerendered routes; scoped tightly here
              so it never gates the rest of the page/shell. The fallback is
              the same control without query-string carry-over, so the
              header doesn't shift when the real switcher hydrates. */}
          <Suspense fallback={<LanguageSwitcher queryString="" />}>
            <LanguageSwitcherWithQuery />
          </Suspense>
          <HeaderAuthStatus
            locale={locale}
            signInLabel={labels.signIn}
            labels={accountMenu}
          />
        </div>
      </div>
    </header>
  );
}
