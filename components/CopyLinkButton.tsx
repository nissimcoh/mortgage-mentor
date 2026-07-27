"use client";

import { useEffect, useRef, useState } from "react";
import { copyScenarioLink } from "@/lib/forms/clipboard";

type CopyLinkStatus = "idle" | "success" | "fallback";

interface CopyLinkButtonProps {
  buttonLabel: string;
  successText: string;
  fallbackText: string;
}

/** Copies the current page URL. Generic on purpose — used by both the
 * calculator's "copy scenario link" and compare's "copy comparison link",
 * which differ only in copy, never in behavior. */
export default function CopyLinkButton({
  buttonLabel,
  successText,
  fallbackText,
}: CopyLinkButtonProps) {
  const [status, setStatus] = useState<CopyLinkStatus>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function handleCopy() {
    const nextStatus = await copyScenarioLink(
      (text) => navigator.clipboard.writeText(text),
      window.location.href,
    );
    setStatus(nextStatus);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setStatus("idle"), 2500);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 sm:py-1.5"
      >
        {buttonLabel}
      </button>
      {status === "success" && (
        <span role="status" className="text-xs text-emerald-700">
          {successText}
        </span>
      )}
      {status === "fallback" && (
        <span role="status" className="text-xs text-amber-700">
          {fallbackText}
        </span>
      )}
    </div>
  );
}
