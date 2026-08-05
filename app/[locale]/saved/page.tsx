import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
import { signOut } from "@/lib/auth/actions";
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/signin?next=${encodeURIComponent(`/${locale}/saved`)}`);
  }

  const dict = await getDictionary(locale);
  const signOutWithLocale = signOut.bind(null, locale);

  return (
    <main className="bg-slate-50 text-slate-900">
      <section className="mx-auto max-w-2xl px-6 pt-10 pb-16 sm:pt-12">
        <Link
          href={`/${locale}`}
          className="text-sm text-slate-500 transition hover:text-slate-800"
        >
          {dict.calculator.backToHome}
        </Link>

        <h1 className="mt-3 mb-4 text-3xl font-bold tracking-tight">
          {dict.nav.saved}
        </h1>

        <p className="mb-3 text-base leading-7 text-slate-600">
          {dict.savedPage.signedInIntro.replace("{email}", user.email ?? "")}
        </p>

        {dict.savedPage.body.map((paragraph) => (
          <p key={paragraph} className="mb-3 text-base leading-7 text-slate-600">
            {paragraph}
          </p>
        ))}

        <form action={signOutWithLocale} className="mt-6">
          <button
            type="submit"
            className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm text-slate-700 transition hover:bg-slate-100"
          >
            {dict.savedPage.signOutButton}
          </button>
        </form>
      </section>
    </main>
  );
}
