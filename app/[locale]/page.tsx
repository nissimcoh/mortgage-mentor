import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
import { getDictionary } from "./dictionaries";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const dict = await getDictionary(locale);
  const t = dict.home;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col items-start justify-center px-6 py-16">
        <div className="mb-6 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">
          {t.devBadge}
        </div>

        <h1 className="mb-6 text-5xl font-bold tracking-tight sm:text-6xl">
          {t.title}
        </h1>

        <p className="mb-4 max-w-2xl text-2xl font-semibold text-slate-800">
          {t.tagline}
        </p>

        <p className="mb-10 max-w-3xl text-lg leading-8 text-slate-600">
          {t.description}
        </p>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            href={`/${locale}/calculator`}
            className="rounded-xl bg-slate-900 px-6 py-3 text-center text-white transition hover:bg-slate-700"
          >
            {t.calculatorCta}
          </Link>

          <a
            href="#about"
            className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-center text-slate-900 transition hover:bg-slate-100"
          >
            {t.aboutCta}
          </a>
        </div>

        <div id="about" className="mt-16 grid w-full gap-4 md:grid-cols-3">
          {t.features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="mb-3 text-xl font-bold">{feature.title}</h2>
              <p className="leading-7 text-slate-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
