import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import PayoffReportUpload from "@/components/PayoffReportUpload";
import { isValidLocale } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/server";
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
    title: `${dict.payoffPage.title} | MortgageMentor`,
    description: dict.payoffPage.intro,
    // Not linked from the site yet; keep it out of search results until it is.
    robots: { index: false, follow: false },
  };
}

export default async function MyMortgagePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  // Reading a report calls a paid API; the endpoint is signed-in only too.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/signin?next=${encodeURIComponent(`/${locale}/my-mortgage`)}`);
  }

  const dict = await getDictionary(locale);

  return (
    <main className="bg-transparent text-slate-900">
      <section className="mx-auto max-w-4xl px-4 pt-8 pb-16 sm:px-6 sm:pt-14">
        <Link
          href={`/${locale}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-900"
        >
          {dict.calculator.backToHome}
        </Link>
        <h1 className="mt-4 mb-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          {dict.payoffPage.title}
        </h1>
        <p className="mb-8 text-lg leading-8 text-slate-500">{dict.payoffPage.intro}</p>
        <PayoffReportUpload locale={locale} labels={dict.payoffPage} />
      </section>
    </main>
  );
}
