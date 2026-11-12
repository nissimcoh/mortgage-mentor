import { locales, type Locale } from "@/lib/i18n/config";

/**
 * Canonical origin for absolute URLs in metadata, the sitemap and robots.txt.
 * Set NEXT_PUBLIC_SITE_URL when the site moves to its own domain; until then
 * it is the production Vercel domain.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://mortgage-mentor-fawn.vercel.app").replace(/\/+$/, "");

/** Public, indexable routes (relative to a locale). Signed-in pages are excluded. */
export const PUBLIC_ROUTES = ["", "/calculator", "/learn", "/privacy", "/terms", "/accessibility"] as const;

/**
 * `alternates` metadata for a public page: its own canonical URL plus the
 * same page in each language. Query strings are deliberately left out, so a
 * shared calculator link never becomes its own indexed page.
 */
export function pageAlternates(locale: Locale, route: (typeof PUBLIC_ROUTES)[number]) {
  return {
    canonical: `/${locale}${route}`,
    languages: {
      ...Object.fromEntries(locales.map((language) => [language, `/${language}${route}`])),
      "x-default": `/he${route}`,
    },
  };
}
