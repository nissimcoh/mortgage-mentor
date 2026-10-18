"use client";

import { useEffect, useRef, useState } from "react";
import { copyScenarioLink } from "@/lib/forms/clipboard";

type CopyLinkStatus = "idle" | "success" | "fallback";

interface CopyLinkButtonProps {
  buttonLabel: string;
  successText: string;
  fallbackText: string;
  getUrl?: () => string;
}

/** Copies the current page URL (or `getUrl()`), with a transient
 * success/fallback status beside the button. */
export default function CopyLinkButton({
  buttonLabel,
  successText,
  fallbackText,
  getUrl,
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
      getUrl ? getUrl() : window.location.href,
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
        className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
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
