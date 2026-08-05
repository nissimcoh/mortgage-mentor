"use server";

import { redirect } from "next/navigation";
import { defaultLocale, isValidLocale } from "../i18n/config";
import { createClient } from "../supabase/server";

/**
 * Bind the locale before wiring this to a <form action={...}>, e.g.
 * `signOut.bind(null, locale)`, so sign-out lands back on the same
 * locale the user was on rather than always the default.
 */
export async function signOut(locale: string, _formData: FormData) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${isValidLocale(locale) ? locale : defaultLocale}`);
}
