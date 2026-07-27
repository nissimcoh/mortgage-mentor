import Link from "next/link";

interface ComingSoonPageProps {
  title: string;
  paragraphs: string[];
  backHref: string;
  backLabel: string;
}

/** Shared shape for the compare/saved/signin placeholders: a clean,
 * non-broken stand-in page rather than a dead link, until each feature
 * actually ships. */
export default function ComingSoonPage({
  title,
  paragraphs,
  backHref,
  backLabel,
}: ComingSoonPageProps) {
  return (
    <main className="bg-slate-50 text-slate-900">
      <section className="mx-auto max-w-2xl px-6 pt-8 pb-16 sm:pt-12">
        <Link
          href={backHref}
          className="text-sm text-slate-500 transition hover:text-slate-800"
        >
          {backLabel}
        </Link>

        <h1 className="mt-3 mb-4 text-3xl font-bold tracking-tight">
          {title}
        </h1>

        {paragraphs.map((paragraph) => (
          <p key={paragraph} className="mb-3 text-base leading-7 text-slate-600">
            {paragraph}
          </p>
        ))}
      </section>
    </main>
  );
}
