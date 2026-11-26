import { BRAND_NAME } from "@/lib/brand";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
import { sanitizeNextPath } from "@/lib/auth/redirect-target";
import { createClient } from "@/lib/supabase/server";
import BrandMark from "@/components/BrandMark";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import LegalNotice from "@/components/LegalNotice";
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
    title: `${dict.nav.signIn} | ${BRAND_NAME}`,
    description: dict.signinPage.intro,
  };
}

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const { next: rawNext, error } = await searchParams;
  const next = sanitizeNextPath(rawNext, `/${locale}/saved`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(next);

  const dict = await getDictionary(locale);

  return (
    <main className="text-slate-900">
      <section className="mx-auto max-w-md px-4 py-10 sm:py-20">
        <div className="glass-panel p-7 text-center sm:p-10">
          <BrandMark className="mx-auto h-14 w-14" />
          <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
            {dict.nav.signIn}
          </h1>
          <p className="mt-3 text-lg leading-7 text-slate-500">
            {dict.signinPage.intro}
          </p>

          {error && (
            <p role="alert" className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {dict.signinPage.callbackErrorMessage}
            </p>
          )}

          <div className="mt-7">
            <GoogleSignInButton locale={locale} next={next} labels={dict.signinPage} />
          </div>
          <div className="mt-6 border-t border-black/[.07] pt-5 text-start">
            <LegalNotice locale={locale} kind="signin" />
          </div>
        </div>
        <p className="mt-6 text-center">
          <Link href={`/${locale}`} className="text-sm text-slate-500 transition-colors hover:text-slate-900">
            {dict.calculator.backToHome}
          </Link>
        </p>
      </section>
    </main>
  );
}
