import { isValidLocale, locales } from "@/lib/i18n/config";
import type { SearchItem } from "@/lib/ui/search";
import { getDictionary } from "../dictionaries";

// Built once per locale at build time and served as a static file; the
// header palette fetches it the first time it opens.
export const dynamic = "force-static";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) return new Response(null, { status: 404 });
  const dict = await getDictionary(locale);
  const categoryLabel = new Map(dict.learnPage.categories.map((category) => [category.id, category.label]));

  const pages: SearchItem[] = [
    { kind: "page", title: dict.nav.calculator, detail: dict.home.calcCardBody, keywords: dict.calculator.title, href: `/${locale}/calculator` },
    { kind: "page", title: dict.learnPage.title, detail: dict.learnPage.intro, keywords: dict.nav.learn, href: `/${locale}/learn` },
    { kind: "page", title: dict.nav.saved, detail: dict.home.savedCardBody, keywords: dict.savedComparison.title, href: `/${locale}/saved` },
    { kind: "page", title: dict.market.title, detail: dict.market.subtitle, keywords: `${dict.market.boiRateLabel} ${dict.market.primeRateLabel} ${dict.market.cpiLabel}`, href: `/${locale}#market` },
    { kind: "page", title: dict.learnPage.rulesTitle, detail: dict.learnPage.rulesIntro, keywords: "", href: `/${locale}/learn#rules-title` },
  ];
  const terms: SearchItem[] = dict.learnPage.entries.map((entry) => ({
    kind: "term",
    title: entry.title,
    detail: entry.body,
    keywords: `${categoryLabel.get(entry.category) ?? ""} ${entry.example}`,
    href: `/${locale}/learn#${entry.id}`,
  }));

  return Response.json([...pages, ...terms], {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
