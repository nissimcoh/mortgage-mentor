import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n/config";
// Type-only import: erased at compile time, keeps the server-only
// dictionary module out of the client bundle.
import type { Dictionary } from "@/app/[locale]/dictionaries";
import AppHeader from "./AppHeader";
import BottomNav from "./BottomNav";

interface AppShellProps {
  locale: Locale;
  nav: Dictionary["nav"];
  accountMenu: Dictionary["accountMenu"];
  children: ReactNode;
}

/**
 * Every locale page renders through this shell: a sticky top header
 * (desktop nav + language switcher + sign-in/account menu) and, on mobile
 * only, a fixed bottom tab bar. `pb-20` on the content wrapper keeps the
 * bottom bar from ever covering the last bit of page content on mobile;
 * it's a no-op on desktop where the bottom bar doesn't render at all.
 */
export default function AppShell({
  locale,
  nav,
  accountMenu,
  children,
}: AppShellProps) {
  return (
    <>
      <AppHeader locale={locale} labels={nav} accountMenu={accountMenu} />
      <div className="flex-1 pb-20 md:pb-0">{children}</div>
      <BottomNav locale={locale} labels={nav} />
    </>
  );
}
