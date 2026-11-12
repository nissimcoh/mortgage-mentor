"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * The home page is served from the CDN and rebuilt in the background, so on
 * a quiet day the first visitor can receive a copy rendered hours ago (that
 * visit is what triggers the rebuild). This asks for the rebuilt page a few
 * seconds later, so stale market figures are replaced without a reload.
 *
 * It renders nothing and only acts when the copy on screen is older than the
 * rebuild interval. Two attempts at most: the rebuild normally finishes
 * within a couple of seconds, and a failed one must not poll forever.
 */
export default function HomeFreshness({ renderedAt, maxAgeSeconds }: { renderedAt: string | undefined; maxAgeSeconds: number }) {
  const router = useRouter();
  const attempts = useRef(0);

  useEffect(() => {
    const rendered = renderedAt ? Date.parse(renderedAt) : NaN;
    if (!Number.isFinite(rendered)) return;
    if (Date.now() - rendered <= maxAgeSeconds * 1000 || attempts.current >= 2) return;
    const delay = attempts.current === 0 ? 3000 : 8000;
    const timer = window.setTimeout(() => {
      attempts.current += 1;
      router.refresh();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [renderedAt, maxAgeSeconds, router]);

  return null;
}
