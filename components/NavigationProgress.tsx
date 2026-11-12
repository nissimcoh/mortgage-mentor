"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A hairline progress bar under the header while a page navigation is in
 * flight. Several routes render on the server per request, so a tap can take
 * a few hundred milliseconds to show anything; this answers the tap at once.
 *
 * A same-origin link click that changes the URL records the URL it started
 * from. While the current URL still equals that one the bar is loading; once
 * the URL differs the new page is on screen and the bar completes. A timeout
 * clears it if the navigation never lands.
 */
export default function NavigationProgress() {
  const pathname = usePathname();
  const here = `${pathname}?${useSearchParams().toString()}`;
  const [startedFrom, setStartedFrom] = useState<string | null>(null);
  const hereRef = useRef(here);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => { hereRef.current = here; }, [here]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      window.clearTimeout(timer.current);
      setStartedFrom(hereRef.current);
      timer.current = window.setTimeout(() => setStartedFrom(null), 12_000);
    };
    document.addEventListener("click", onClick);
    return () => { document.removeEventListener("click", onClick); window.clearTimeout(timer.current); };
  }, []);

  if (startedFrom === null) return null;
  const done = startedFrom !== here;
  return (
    <span aria-hidden="true" data-phase={done ? "done" : "loading"} className="nav-progress"
      onAnimationEnd={() => { if (done) { window.clearTimeout(timer.current); setStartedFrom(null); } }} />
  );
}
