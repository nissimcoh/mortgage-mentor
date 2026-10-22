"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import TermVisual from "@/components/TermVisual";

type Labels = Dictionary["learnPage"];
type Entry = Labels["entries"][number];

const normalize = (text: string) => text.toLocaleLowerCase().replace(/[״׳'"“”]/g, "").trim();

/** Wraps literal (case-insensitive) matches of the query in <mark>. */
function highlight(text: string, query: string): ReactNode {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length < 2) return text;
  const haystack = text.toLocaleLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, from)) {
    parts.push(text.slice(from, at), <mark key={at} className="rounded bg-accent-luxe-soft px-0.5 text-inherit">{text.slice(at, at + needle.length)}</mark>);
    from = at + needle.length;
  }
  parts.push(text.slice(from));
  return parts;
}

function TermCard({ entry, labels, query, index, Heading }: {
  entry: Entry; labels: Labels; query: string; index: number; Heading: "h3" | "h4";
}) {
  return (
    <article id={entry.id} className="glass-panel mm-card-in scroll-mt-56 p-5 target:ring-2 target:ring-accent/40 sm:p-6"
      style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}>
      <p className="mb-2 text-xs font-medium text-accent">{labels.categories.find((item) => item.id === entry.category)?.label}</p>
      <Heading className="text-lg font-bold">{highlight(entry.title, query)}</Heading>
      <p className="mt-3 text-sm leading-7 text-slate-600">{highlight(entry.body, query)}</p>
      <TermVisual id={entry.id} labels={labels.visuals} />
      <details className="glass-track mt-4 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-accent">{labels.exampleLabel}</summary>
        <p className="mt-3 text-sm leading-7 text-slate-700">{highlight(entry.example, query)}</p>
      </details>
    </article>
  );
}

export default function LearningGlossary({ labels }: { labels: Labels }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  // A link to #term-… must land on its card even when the current search or
  // category filter hides it: clear the filters, then scroll once it renders.
  useEffect(() => {
    const revealHashTarget = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!labels.entries.some((entry) => entry.id === id)) return;
      setQuery("");
      setCategory("all");
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    };
    window.addEventListener("hashchange", revealHashTarget);
    return () => window.removeEventListener("hashchange", revealHashTarget);
  }, [labels.entries]);

  const matchesQuery = (entry: Entry) => normalize(`${entry.title} ${entry.body} ${entry.example}`).includes(normalize(query));
  const terms = labels.entries.filter((entry) => (category === "all" || entry.category === category) && matchesQuery(entry));
  const countIn = (id: string) => labels.entries.filter((entry) => (id === "all" || entry.category === id) && matchesQuery(entry)).length;
  // With no filter the glossary reads as a course: one section per topic.
  const grouped = category === "all" && query.trim() === "";
  const filtering = category !== "all" || query.trim() !== "";

  return (
    <section aria-labelledby="glossary-title">
      <h2 id="glossary-title" className="text-xl font-bold">{labels.glossaryTitle}</h2>
      <div className="glass-panel glass-form sticky! top-[4.25rem] z-30 mt-4 overflow-hidden p-3 sm:top-[4.75rem] sm:p-4">
        <label htmlFor="term-search" className="sr-only">{labels.searchLabel}</label>
        <input id="term-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={labels.searchPlaceholder} className="w-full rounded-xl border px-4 py-2.5 text-base" />
        <div className="-mx-3 mt-3 flex gap-2 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] sm:-mx-4 sm:px-4" aria-label={labels.allLabel}>
          {[{ id: "all", label: labels.allLabel }, ...labels.categories].map((item) => {
            const count = countIn(item.id);
            const selected = category === item.id;
            return (
              <button key={item.id} type="button" aria-pressed={selected} onClick={() => setCategory(item.id)}
                className={`flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition ${selected ? "glass-button text-white" : "glass-secondary"} ${count === 0 && !selected ? "opacity-50" : ""}`}>
                {item.label}
                <span className={`rounded-full px-1.5 text-xs tabular-nums ${selected ? "bg-white/20" : "bg-slate-900/5 text-slate-500"}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="my-5 flex items-center justify-between gap-3 text-sm text-slate-600">
        <p role="status">{terms.length} {labels.countLabel}</p>
        {filtering && <button type="button" onClick={() => { setQuery(""); setCategory("all"); }} className="text-accent underline decoration-accent/30 underline-offset-4">{labels.clearFilters}</button>}
      </div>
      {terms.length === 0 && <p className="glass-panel p-6 text-sm leading-7">{labels.emptyLabel}</p>}
      {grouped ? (
        labels.categories.map((group) => {
          const groupTerms = terms.filter((entry) => entry.category === group.id);
          return (
            <section key={group.id} aria-labelledby={`topic-${group.id}`} className="mm-scroll-reveal mb-10">
              <div className="mb-4 flex items-baseline gap-3 border-b border-slate-900/10 pb-2">
                <h3 id={`topic-${group.id}`} className="text-lg font-bold text-slate-900">{group.label}</h3>
                <span className="text-sm text-slate-500">{groupTerms.length} {labels.countLabel}</span>
              </div>
              <div className="grid items-start gap-4 md:grid-cols-2">
                {groupTerms.map((entry, index) => <TermCard key={entry.id} entry={entry} labels={labels} query="" index={index} Heading="h4" />)}
              </div>
            </section>
          );
        })
      ) : (
        <div key={category} className="grid items-start gap-4 md:grid-cols-2">
          {terms.map((entry, index) => <TermCard key={entry.id} entry={entry} labels={labels} query={query} index={index} Heading="h3" />)}
        </div>
      )}
    </section>
  );
}
