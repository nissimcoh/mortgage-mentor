"use client";

import { useState } from "react";
import type { Dictionary } from "@/app/[locale]/dictionaries";

const normalize = (text: string) => text.toLocaleLowerCase().replace(/[״׳'"“”]/g, "").trim();

export default function LearningGlossary({ labels }: { labels: Dictionary["learnPage"] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const terms = labels.entries.filter((entry) =>
    (category === "all" || entry.category === category) &&
    normalize(`${entry.title} ${entry.body} ${entry.example}`).includes(normalize(query)),
  );
  return (
    <section aria-labelledby="glossary-title">
      <div className="glass-panel glass-form p-5 sm:p-6">
        <h2 id="glossary-title" className="text-xl font-bold">{labels.glossaryTitle}</h2>
        <label htmlFor="term-search" className="mb-2 mt-5 block text-sm font-medium">{labels.searchLabel}</label>
        <input id="term-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={labels.searchPlaceholder} className="w-full rounded-xl border px-4 py-3 text-base" />
        <div className="mt-4 flex flex-wrap gap-2" aria-label={labels.allLabel}>
          {[{ id: "all", label: labels.allLabel }, ...labels.categories].map((item) => (
            <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => setCategory(item.id)} className={`min-h-11 rounded-full border px-4 py-2 text-sm ${category === item.id ? "glass-button text-white" : "glass-secondary"}`}>{item.label}</button>
          ))}
        </div>
      </div>
      <p role="status" className="my-5 text-sm text-slate-600">{terms.length} {labels.countLabel}</p>
      {terms.length === 0 && <p className="glass-panel p-6 text-sm leading-7">{labels.emptyLabel}</p>}
      <div className="grid items-start gap-4 md:grid-cols-2">
        {terms.map((entry) => (
          <article key={entry.id} id={entry.id} className="glass-panel scroll-mt-24 p-5 sm:p-6">
            <p className="mb-2 text-xs font-medium text-accent">{labels.categories.find((item) => item.id === entry.category)?.label}</p>
            <h3 className="text-lg font-bold">{entry.title}</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">{entry.body}</p>
            <details className="glass-track mt-4 px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-accent">{labels.exampleLabel}</summary>
              <p className="mt-3 text-sm leading-7 text-slate-700">{entry.example}</p>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
