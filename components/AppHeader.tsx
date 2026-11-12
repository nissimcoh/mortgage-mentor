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
import NavigationProgress from "./NavigationProgress";
import SearchLauncher from "./SearchLauncher";

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
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      {/* One slim bar: brand at the start, links centered, controls at the
          end. The brand shrinks (and truncates) before the controls do, so
          narrow phones never scroll sideways. */}
      <div className="mx-auto grid h-12 max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 sm:px-6 md:grid-cols-[1fr_auto_1fr]">
        <Link href={`/${locale}`} className="flex min-w-0 items-center gap-2 justify-self-start">
          <BrandMark className="h-7 w-7 shrink-0" />
          {/* Latin wordmark: LTR so any truncation clips its end. */}
          <span dir="ltr" className="truncate text-[15px] font-semibold tracking-tight text-slate-900">
            {labels.appName}
          </span>
          {labels.appNameLocalized && <span className="sr-only">{labels.appNameLocalized}</span>}
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
              className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
                isActive(item.href)
                  ? "font-semibold text-slate-900"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-0.5 justify-self-end sm:gap-1">
          <SearchLauncher locale={locale} labels={labels} />
          {/* useSearchParams (inside LanguageSwitcher) needs a Suspense
              boundary on statically prerendered routes; scoped tightly here
              so it never gates the rest of the page/shell. The fallback is
              the same control without query-string carry-over, so the
              header doesn't shift when the real switcher hydrates. */}
          <Suspense fallback={<LanguageSwitcher queryString="" />}>
            <LanguageSwitcherWithQuery />
          </Suspense>
          <span className="ms-1.5">
            <HeaderAuthStatus
              locale={locale}
              signInLabel={labels.signIn}
              labels={accountMenu}
            />
          </span>
        </div>
      </div>
    </header>
  );
}
