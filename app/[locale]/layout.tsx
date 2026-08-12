import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import { notFound } from "next/navigation";
import { getDirection, isValidLocale, locales } from "@/lib/i18n/config";
import AppShell from "@/components/AppShell";
import { getDictionary } from "./dictionaries";
import "../globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// Forces a light presentation on iOS/Android regardless of OS dark-mode
// settings (this app has no dark theme), and `viewportFit: "cover"` is what
// makes env(safe-area-inset-*) resolve to real values instead of 0 — both
// the header's top padding and BottomNav's bottom padding depend on it.
export const viewport: Viewport = {
  themeColor: "#f8fafc",
  colorScheme: "light",
  viewportFit: "cover",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getDictionary(locale);
  return {
    title: dict.metadata.title,
    description: dict.metadata.description,
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getDictionary(locale);

  return (
    <html
      lang={locale}
      dir={getDirection(locale)}
      className={`${heebo.variable} min-h-dvh antialiased`}
    >
      <body className="flex min-h-dvh flex-col bg-slate-50">
        <AppShell locale={locale} nav={dict.nav} accountMenu={dict.accountMenu}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
