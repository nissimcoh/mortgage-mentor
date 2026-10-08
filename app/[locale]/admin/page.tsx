import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
import { requireAdmin } from "@/lib/admin/guard";
import { loadUserOverview } from "@/lib/admin/load-user-overview";
import { overviewLabels } from "@/lib/admin/overview-labels";
import AdminUserOverview from "@/components/AdminUserOverview";
import { getDictionary } from "../dictionaries";

export async function generateMetadata({ params }: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();
  return {
    title: `${overviewLabels[locale].title} | MortgageMentor`,
    robots: { index: false, follow: false },
  };
}

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const text = overviewLabels[locale];
  const guard = await requireAdmin();
  if (!guard.ok && guard.error === "unauthenticated") {
    redirect(`/${locale}/signin?next=${encodeURIComponent(`/${locale}/admin`)}`);
  }
  if (!guard.ok) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10 text-slate-900">
        <Link href={`/${locale}`} className="text-sm text-slate-600">{dict.calculator.backToHome}</Link>
        <h1 className="mt-3 text-2xl font-bold">{dict.adminPage.notAuthorizedTitle}</h1>
        <p className="mt-2 leading-7 text-slate-600">{dict.adminPage.notAuthorizedBody}</p>
      </main>
    );
  }

  const loadedAt = new Date().toISOString();
  let users = null;
  try {
    users = await loadUserOverview(guard.supabase, guard.user.id, Date.parse(loadedAt));
  } catch {
    // Never log identifiers, database responses or private metadata.
    console.error("[admin] complete user activity metadata could not be loaded");
  }
  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10 text-slate-900">
      <Link href={`/${locale}`} className="text-sm text-slate-600">{dict.calculator.backToHome}</Link>
      <h1 className="mt-3 text-3xl font-bold">{text.title}</h1>
      <p className="mt-2 mb-6 text-sm leading-6 text-slate-600">{text.intro}</p>
      {users === null ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{text.loadError}</p>
      ) : <AdminUserOverview users={users} locale={locale} loadedAt={loadedAt} />}
    </main>
  );
}
