import { notFound, redirect } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";

/**
 * Scenario comparison is being redesigned around saved scenarios (and,
 * later, accounts) rather than pasting two calculator links — see the
 * product decision in the "Realign navigation" milestone. Until the real
 * comparison flow is reintroduced, /compare redirects to /learn instead of
 * exposing the retired paste-link UI or 404ing on old shared links.
 */
export default async function ComparePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  redirect(`/${locale}/learn`);
}
