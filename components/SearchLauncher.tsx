"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import Icon from "./Icon";

// The palette (and its search index) is fetched the first time it opens, so
// it costs nothing on pages where nobody searches.
const CommandPalette = lazy(() => import("./CommandPalette"));

export default function SearchLauncher({ locale, labels }: { locale: Locale; labels: Dictionary["nav"] }) {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName));
      const shortcut = (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing);
      if (!shortcut) return;
      event.preventDefault();
      setEverOpened(true);
      setOpen((value) => !value);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => { setEverOpened(true); setOpen(true); }}
        aria-label={labels.search}
        aria-haspopup="dialog"
        title={`${labels.search} (⌘K)`}
        className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-black/5 hover:text-slate-900"
      >
        <Icon name="search" size={18} />
      </button>
      {everOpened && (
        <Suspense fallback={null}>
          <CommandPalette open={open} onClose={() => setOpen(false)} locale={locale} labels={labels} />
        </Suspense>
      )}
    </>
  );
}
