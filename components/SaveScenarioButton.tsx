"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { createScenario } from "@/lib/scenarios/actions";
import type { TrackDraft } from "@/lib/mortgage/scenario-form";
import { createClient } from "@/lib/supabase/client";

type DialogStatus = "idle" | "open" | "saving" | "error";

const TOAST_AUTO_DISMISS_MS = 4500;

interface SaveScenarioButtonProps {
  locale: Locale;
  buttonLabel: string;
  drafts: TrackDraft[];
  labels: Dictionary["saveScenarioDialog"];
}

/**
 * Save-to-Supabase entry point next to CopyLinkButton. Signed-out clicks
 * never open the dialog — they redirect to /signin with the current
 * calculator URL preserved as the sanitized return destination (the
 * existing sanitizeNextPath/callback infrastructure handles the rest);
 * the user simply presses Save again once back here, signed in.
 *
 * The name-entry dialog is a small blocking modal on purpose (it needs
 * input). A successful save closes it immediately — there is no in-dialog
 * success state — and hands off to a separate, non-blocking toast so the
 * calculator stays fully interactive underneath.
 */
export default function SaveScenarioButton({
  locale,
  buttonLabel,
  drafts,
  labels,
}: SaveScenarioButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<DialogStatus>("idle");
  const [name, setName] = useState(labels.defaultName);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status !== "open") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStatus("idle");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [status]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  function showToast() {
    setToastOpen(true);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(
      () => setToastOpen(false),
      TOAST_AUTO_DISMISS_MS,
    );
  }

  async function handleOpen() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const next = `${pathname}?${searchParams.toString()}`;
      router.push(`/${locale}/signin?next=${encodeURIComponent(next)}`);
      return;
    }

    setToastOpen(false);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setName(labels.defaultName);
    setErrorMessage(null);
    setStatus("open");
  }

  async function handleSave() {
    setStatus("saving");
    setErrorMessage(null);

    const result = await createScenario({ name, locale, tracks: drafts });

    if (result.ok) {
      setStatus("idle");
      showToast();
      return;
    }

    setErrorMessage(
      result.error === "invalid-name"
        ? labels.nameInvalidMessage
        : labels.genericErrorMessage,
    );
    setStatus("open");
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90 sm:py-1.5"
      >
        {buttonLabel}
      </button>

      {(status === "open" || status === "saving") && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={labels.title}
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 px-4 pb-4 sm:items-center sm:pb-0"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-lg">
            <h2 className="mb-3 text-lg font-bold text-slate-900">
              {labels.title}
            </h2>
            <label
              htmlFor="save-scenario-name"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              {labels.nameLabel}
            </label>
            <input
              id="save-scenario-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={status === "saving"}
              maxLength={120}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            />

            {errorMessage && (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {errorMessage}
              </p>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setStatus("idle")}
                disabled={status === "saving"}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                {labels.cancelButton}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={status === "saving"}
                className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === "saving" ? labels.savingButton : labels.saveButton}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastOpen && (
        // Non-blocking: no scrim, calculator stays fully interactive.
        // Positioned above the fixed mobile BottomNav (5rem clearance,
        // matching AppShell's own pb-20 content spacing) plus the safe
        // area; docks to a plain corner once BottomNav is hidden (md:+).
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 md:inset-x-auto md:end-6 md:bottom-6 md:w-96"
        >
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
            <span aria-hidden="true" className="mt-0.5 text-emerald-600">
              ✓
            </span>
            <div className="flex-1">
              {/* Confirmation text is deliberately plain, non-interactive
                  text — only the link below navigates anywhere. */}
              <p className="text-sm font-medium text-slate-900">
                {labels.successMessage}
              </p>
              <Link
                href={`/${locale}/saved`}
                onClick={() => setToastOpen(false)}
                className="mt-1 inline-block text-sm font-medium text-accent underline underline-offset-2"
              >
                {labels.viewSavedLink}
              </Link>
            </div>
            <button
              type="button"
              onClick={() => setToastOpen(false)}
              aria-label={labels.dismissAriaLabel}
              className="text-slate-400 transition hover:text-slate-600"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
