"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { createScenario } from "@/lib/scenarios/actions";
import type { TrackDraft } from "@/lib/mortgage/scenario-form";
import { createClient } from "@/lib/supabase/client";
import LegalNotice from "./LegalNotice";
import ModalDialog from "./ModalDialog";

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const savingRef = useRef(false);

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

  function redirectToSignIn() {
    const next = `${pathname}?${searchParams.toString()}`;
    router.push(`/${locale}/signin?next=${encodeURIComponent(next)}`);
  }

  async function handleOpen() {
    // A local cookie read is enough to choose between the dialog and the
    // sign-in redirect; the save action itself re-verifies the user with
    // the auth server, so the dialog opens without a network round trip.
    const {
      data: { session },
    } = await createClient().auth.getSession();
    const user = session?.user ?? null;

    if (!user) {
      redirectToSignIn();
      return;
    }

    setToastOpen(false);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setName(labels.defaultName);
    setErrorMessage(null);
    setStatus("open");
  }

  async function handleSave() {
    if (savingRef.current) return;
    savingRef.current = true;
    setStatus("saving");
    setErrorMessage(null);
    try {
      const result = await createScenario({ name, locale, tracks: drafts });

      if (result.ok) {
        setStatus("idle");
        showToast();
        return;
      }
      if (result.error === "unauthenticated") {
        // The local session looked valid but the server rejected it.
        setStatus("idle");
        redirectToSignIn();
        return;
      }

      setErrorMessage(
        result.error === "invalid-name"
          ? labels.nameInvalidMessage
          : labels.genericErrorMessage,
      );
      setStatus("open");
    } catch {
      setErrorMessage(labels.genericErrorMessage);
      setStatus("open");
    } finally { savingRef.current = false; }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className="min-h-11 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90"
      >
        {buttonLabel}
      </button>

      {(status === "open" || status === "saving") && (
        <ModalDialog label={labels.title} busy={status === "saving"} onClose={() => setStatus("idle")} returnFocusRef={triggerRef}>
          <form onSubmit={event => { event.preventDefault(); void handleSave(); }} className="glass-form glass-panel max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-lg">
            <h2 className="mb-3 text-lg font-bold text-slate-900">
              {labels.title}
            </h2>
            <LegalNotice locale={locale} kind="save" />
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
                type="submit"
                disabled={status === "saving"}
                className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === "saving" ? labels.savingButton : labels.saveButton}
              </button>
            </div>
          </form>
        </ModalDialog>
      )}

      {toastOpen && (
        // Non-blocking: no scrim, calculator stays fully interactive.
        // Positioned above the fixed mobile BottomNav (5rem clearance,
        // matching AppShell's own bottom content spacing) plus the safe
        // area; docks to a plain corner once BottomNav is hidden (md:+).
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 md:inset-x-auto md:end-6 md:bottom-6 md:w-96"
        >
          <div className="glass-panel flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
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
