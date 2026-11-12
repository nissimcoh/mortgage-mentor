"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const canAnimate = () =>
  typeof window.matchMedia === "function" &&
  typeof window.requestAnimationFrame === "function" &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const subscribeToNothing = () => () => {};

/**
 * Counts from the figure currently on screen to `value`; a figure that first
 * appears in the browser (after pressing Calculate) counts up from 0.
 *
 * A figure that arrives in the server's HTML (a shared calculator link) is
 * shown as is: the server snapshot below is `false`, so hydration renders the
 * same text the server sent instead of "0" — a mismatch there makes React
 * discard and rebuild the whole page on the client. Without animation support
 * or under reduced motion it always renders `value` directly, so the final
 * figure is never delayed for those readers or for tests.
 */
export default function AnimatedNumber({ value, format, duration = 700 }: {
  value: number;
  format: (value: number) => string;
  duration?: number;
}) {
  const animate = useSyncExternalStore(subscribeToNothing, canAnimate, () => false);
  const [shown, setShown] = useState(animate ? 0 : value);
  // The figure on screen, kept outside state so an interrupted run (a new
  // value mid-count, or React re-running the effect in development) resumes
  // from where it stopped instead of jumping or stalling.
  const shownRef = useRef(shown);

  useEffect(() => {
    if (!animate) return;
    const from = shownRef.current;
    if (from === value) return;
    // Timed from the first frame's own timestamp, so it never depends on
    // two clocks agreeing.
    let start: number | undefined;
    let frame = requestAnimationFrame(function tick(now) {
      start ??= now;
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      const next = progress >= 1 ? value : from + (value - from) * (1 - (1 - progress) ** 3);
      shownRef.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [animate, value, duration]);

  return <>{format(animate ? shown : value)}</>;
}
