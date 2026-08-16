import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
import { applyTracksToQuery } from "@/lib/mortgage/scenario-form";
import {
  isValidResultSnapshot,
  validateInputPayload,
} from "@/lib/scenarios/payload";
import { createClient } from "@/lib/supabase/server";
import ScenarioCard from "@/components/ScenarioCard";
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
    description: dict.savedPage.intro,
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

  // RLS's "select own scenarios" policy is the real ownership boundary;
  // this .eq("user_id", ...) is the normal, expected app-level filter on
  // top of it, using the signed-in user's own session as usual.
  const { data: rows, error } = await supabase
    .from("mortgage_scenarios")
    .select("id, name, input_payload, result_snapshot, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    // Safe fields only (never the caller's session/tokens) — the user
    // only ever sees the generic, translated loadErrorMessage below, not
    // this raw Postgres error.
    console.error("[saved] failed to load scenarios:", {
      code: error.code,
      message: error.message,
      hint: error.hint,
    });
  }

  return (
    <main className="bg-slate-50 text-slate-900">
      <section className="mx-auto max-w-3xl px-6 pt-10 pb-16 sm:pt-12">
        <Link
          href={`/${locale}`}
          className="text-sm text-slate-500 transition hover:text-slate-800"
        >
          {dict.calculator.backToHome}
        </Link>

        <h1 className="mt-3 mb-2 text-3xl font-bold tracking-tight">
          {dict.nav.saved}
        </h1>
        <p className="mb-6 text-base leading-7 text-slate-600">
          {dict.savedPage.intro}
        </p>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {dict.savedPage.loadErrorMessage}
          </p>
        )}

        {!error && rows && rows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
            <p className="text-base font-medium text-slate-700">
              {dict.savedPage.emptyTitle}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {dict.savedPage.emptyBody}
            </p>
            <Link
              href={`/${locale}/calculator`}
              className="mt-4 inline-block rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              {dict.savedPage.emptyCta}
            </Link>
          </div>
        )}

        {!error && rows && rows.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((row) => {
              const payload = validateInputPayload(row.input_payload);
              const openHref = payload
                ? `/${locale}/calculator?${applyTracksToQuery(
                    new URLSearchParams(),
                    payload.tracks,
                  ).toString()}`
                : null;
              const resultSnapshot = isValidResultSnapshot(row.result_snapshot)
                ? row.result_snapshot
                : null;

              return (
                <ScenarioCard
                  key={row.id}
                  id={row.id}
                  name={row.name}
                  updatedAt={row.updated_at}
                  locale={locale}
                  resultSnapshot={resultSnapshot}
                  openHref={openHref}
                  labels={dict.savedPage}
                />
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
