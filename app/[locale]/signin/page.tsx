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
    title: `${dict.nav.signIn} | MortgageMentor`,
    description: dict.signinPage.body[0],
  };
}

export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getDictionary(locale);

  return (
    <ComingSoonPage
      title={dict.nav.signIn}
      paragraphs={dict.signinPage.body}
      backHref={`/${locale}`}
      backLabel={dict.calculator.backToHome}
    />
  );
}
