"use client";

import { useEffect, useRef, useState } from "react";

const canAnimate = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  typeof window.requestAnimationFrame === "function" &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Counts from the previous value (0 on first show) to `value`. Without
 * animation support or under reduced motion it renders `value` directly, so
 * the final figure is never delayed for those readers or for tests.
 */
export default function AnimatedNumber({ value, format, duration = 700 }: {
  value: number;
  format: (value: number) => string;
  duration?: number;
}) {
  const [animate] = useState(canAnimate);
  const [shown, setShown] = useState(animate ? 0 : value);
  const fromRef = useRef(animate ? 0 : value);

  useEffect(() => {
    if (!animate) return;
    const from = fromRef.current;
    fromRef.current = value;
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
