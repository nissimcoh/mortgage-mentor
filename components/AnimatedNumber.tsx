"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const canAnimate = () =>
  typeof window.matchMedia === "function" &&
  typeof window.requestAnimationFrame === "function" &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const subscribeToNothing = () => () => {};

/**
 * Counts from the previous value to `value`; a figure that first appears in
 * the browser (after pressing Calculate) counts up from 0.
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
  const fromRef = useRef(animate ? 0 : value);

  useEffect(() => {
    if (!animate) return;
    const from = fromRef.current;
    fromRef.current = value;
    if (from === value) return;
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const progress = Math.min(1, (now - start) / duration);
      setShown(from + (value - from) * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [animate, value, duration]);

  return <>{format(animate ? shown : value)}</>;
}
