import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
import { sanitizeNextPath } from "@/lib/auth/redirect-target";
import { createClient } from "@/lib/supabase/server";
import GoogleSignInButton from "@/components/GoogleSignInButton";
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
    <main className="bg-transparent text-slate-900">
      <section className="mx-auto max-w-lg px-6 py-10 sm:py-16">
        <div className="glass-panel p-6 sm:p-8">
        <Link
          href={`/${locale}`}
          className="text-sm text-slate-500 transition hover:text-slate-800"
        >
          {dict.calculator.backToHome}
        </Link>

        <h1 className="mt-3 mb-4 text-3xl font-bold tracking-tight">
          {dict.nav.signIn}
        </h1>

        <p className="mb-6 text-base leading-7 text-slate-600">
          {dict.signinPage.intro}
        </p>

        {error && (
          <p role="alert" className="mb-4 text-sm text-red-600">
            {dict.signinPage.callbackErrorMessage}
          </p>
        )}

        <GoogleSignInButton locale={locale} next={next} labels={dict.signinPage} />
        </div>
      </section>
    </main>
  );
}
