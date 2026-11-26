import { BRAND_NAME } from "@/lib/brand";
import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import { notFound } from "next/navigation";
import { getDirection, isValidLocale, locales } from "@/lib/i18n/config";
import AppShell from "@/components/AppShell";
import { SITE_URL } from "@/lib/site";
import { getDictionary } from "./dictionaries";
import "../globals.css";

// Apple devices render the system face (see --font-stack in globals.css) and
// never request this file; without a preload they don't pay for it either.
// Everywhere else Heebo swaps in over a metric-adjusted fallback.
const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  display: "swap",
  preload: false,
});

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// Forces a light presentation on iOS/Android regardless of OS dark-mode
// settings (this app has no dark theme), and `viewportFit: "cover"` is what
// makes env(safe-area-inset-*) resolve to real values instead of 0 — both
// the header's top padding and BottomNav's bottom padding depend on it.
export const viewport: Viewport = {
  themeColor: "#fafafc",
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
  const image = { url: `/og/${locale}.png`, width: 1200, height: 630, alt: dict.metadata.title };
  return {
    metadataBase: new URL(SITE_URL),
    title: dict.metadata.title,
    description: dict.metadata.description,
    applicationName: dict.metadata.applicationName,
    // Link previews in WhatsApp, iMessage, Slack and social networks.
    openGraph: {
      type: "website",
      siteName: BRAND_NAME,
      locale: locale === "he" ? "he_IL" : "en_US",
      title: dict.metadata.title,
      description: dict.metadata.description,
      images: [image],
    },
    twitter: { card: "summary_large_image", title: dict.metadata.title, description: dict.metadata.description, images: [image] },
    appleWebApp: {
      title: dict.metadata.applicationName,
      capable: false,
    },
    // Also available at Safari's conventional root discovery URL.
    icons: {
      apple: { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    },
    verification: {
      google: "H7nqcJ-9_Xx4hLEr9C-FigdH7Rwet4R907Q0nzSk9j0",
    },
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
      <body className="flex min-h-dvh flex-col">
        <AppShell locale={locale} nav={dict.nav} accountMenu={dict.accountMenu}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
