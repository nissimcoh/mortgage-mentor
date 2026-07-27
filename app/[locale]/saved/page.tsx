import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
import ComingSoonPage from "@/components/ComingSoonPage";
import { getDictionary } from "../dictionaries";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getDictionary(locale);
  return {
    title: `${dict.nav.saved} | MortgageMentor`,
    description: dict.savedPage.body[0],
  };
}

export default async function SavedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getDictionary(locale);

  return (
    <ComingSoonPage
      title={dict.nav.saved}
      paragraphs={dict.savedPage.body}
      backHref={`/${locale}`}
      backLabel={dict.calculator.backToHome}
    />
  );
}
