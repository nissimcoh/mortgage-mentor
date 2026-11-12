import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n/config";
import { legalDetailsComplete } from "@/lib/legal/config";
import { PUBLIC_ROUTES, SITE_URL } from "@/lib/site";

const LEGAL_ROUTES = ["/privacy", "/terms", "/accessibility"];

export default function sitemap(): MetadataRoute.Sitemap {
  // Draft legal pages are marked noindex (see LegalPage); keep them out here too.
  const routes = PUBLIC_ROUTES.filter((route) => legalDetailsComplete || !LEGAL_ROUTES.includes(route));
  return routes.flatMap((route) =>
    locales.map((locale) => ({
      url: `${SITE_URL}/${locale}${route}`,
      changeFrequency: route === "" ? "daily" as const : "weekly" as const,
      priority: route === "" ? 1 : route === "/calculator" ? 0.9 : LEGAL_ROUTES.includes(route) ? 0.3 : 0.7,
      alternates: { languages: Object.fromEntries(locales.map((language) => [language, `${SITE_URL}/${language}${route}`])) },
    })),
  );
}
