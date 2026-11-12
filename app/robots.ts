import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n/config";
import { SITE_URL } from "@/lib/site";

// Signed-in areas redirect to sign-in anyway; listing them saves crawl budget.
const PRIVATE = ["saved", "compare", "admin", "auth", "signin", "search-index"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: locales.flatMap((locale) => PRIVATE.map((path) => `/${locale}/${path}`)) },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
