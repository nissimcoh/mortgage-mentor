"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import { rankSearchItems, type SearchItem } from "@/lib/ui/search";
import Icon from "./Icon";

const indexCache = new Map<Locale, Promise<SearchItem[]>>();
function loadIndex(locale: Locale): Promise<SearchItem[]> {
  let pending = indexCache.get(locale);
  if (!pending) {
    pending = fetch(`/${locale}/search-index`).then((response) => {
      if (!response.ok) throw new Error("search index unavailable");
      return response.json() as Promise<SearchItem[]>;
    });
    // A failed load must not be remembered: the next open retries.
    pending.catch(() => indexCache.delete(locale));
    indexCache.set(locale, pending);
  }
  return pending;
}

/**
 * Header search: pages and every glossary term, filtered as you type and
 * fully keyboard-driven (arrows, Enter, Escape). A native <dialog> supplies
 * the focus trap, Escape handling and the inert backdrop.
 */
export default function CommandPalette({ open, onClose, locale, labels }: {
  open: boolean;
  onClose: () => void;
  locale: Locale;
  labels: Dictionary["nav"];
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [items, setItems] = useState<SearchItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
      let current = true;
      loadIndex(locale).then(
        (loaded) => { if (current) { setItems(loaded); setFailed(false); } },
        () => { if (current) setFailed(true); },
      );
      return () => { current = false; };
    }
    if (!open && dialog.open) dialog.close();
  }, [open, locale]);

  const results = useMemo(() => (items ? rankSearchItems(items, query) : []), [items, query]);
  const selected = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  function go(item: SearchItem) {
    onClose();
    setQuery("");
    setActive(0);
    // A same-page #term link must fire hashchange so the glossary can clear
    // a filter that hides the card; a client-side push would not.
    const url = new URL(item.href, window.location.href);
    if (url.pathname === window.location.pathname && url.hash) window.location.assign(url.hash);
    else router.push(item.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive(Math.min(selected + 1, results.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(Math.max(selected - 1, 0)); }
    else if (event.key === "Enter" && results[selected]) { event.preventDefault(); go(results[selected]); }
  }

  const listId = "command-palette-results";
  return (
    <dialog
      ref={dialogRef}
      aria-label={labels.search}
      onClose={onClose}
      onClick={(event) => { if (event.target === dialogRef.current) onClose(); }}
      className="command-palette"
    >
      <div className="flex max-h-[min(34rem,calc(100dvh-7rem))] flex-col" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-black/[.07] px-4">
          <Icon name="search" size={20} className="shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[selected] ? `${listId}-${selected}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            enterKeyHint="go"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActive(0); }}
            placeholder={labels.searchPlaceholder}
            className="h-14 min-w-0 flex-1 bg-transparent text-[17px] text-slate-900 outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden"
          />
          <button type="button" onClick={onClose} aria-label={labels.searchClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-black/5 hover:text-slate-900">
            <Icon name="close" size={16} />
          </button>
        </div>

        <ul ref={listRef} id={listId} role="listbox" aria-label={labels.search} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {results.map((item, index) => (
            <li key={item.href} id={`${listId}-${index}`} data-index={index} role="option" aria-selected={index === selected}
              onPointerMove={() => setActive(index)} onClick={() => go(item)}
              className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${index === selected ? "bg-accent-soft" : ""}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${item.kind === "page" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>
                <Icon name={item.kind === "page" ? "arrowUpRight" : "book"} size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-slate-900">{item.title}</span>
                <span className="block truncate text-[13px] text-slate-500">{item.detail}</span>
              </span>
              <span className="shrink-0 text-[11px] text-slate-400">{item.kind === "page" ? labels.searchPages : labels.searchTerms}</span>
            </li>
          ))}
          {items && results.length === 0 && <li className="px-3 py-8 text-center text-sm text-slate-500">{labels.searchEmpty}</li>}
          {!items && !failed && <li aria-busy="true" className="px-3 py-8 text-center text-sm text-slate-400">{labels.searchLoading}</li>}
          {failed && <li role="alert" className="px-3 py-8 text-center text-sm text-slate-500">{labels.searchError}</li>}
        </ul>

        <p className="hidden items-center gap-4 border-t border-black/[.07] px-4 py-2.5 text-[11px] text-slate-500 sm:flex">
          <span className="flex items-center gap-1.5"><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd>{labels.searchHintMove}</span>
          <span className="flex items-center gap-1.5"><kbd className="kbd">↵</kbd>{labels.searchHintOpen}</span>
          <span className="flex items-center gap-1.5"><kbd className="kbd">esc</kbd>{labels.searchHintClose}</span>
        </p>
      </div>
    </dialog>
  );
}
