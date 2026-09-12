"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { createScenario, updateScenario } from "@/lib/scenarios/actions";
import type { ScenarioActionError } from "@/lib/scenarios/contract";
import { buildNewVersionName } from "@/lib/scenarios/payload";
import type { TrackDraft } from "@/lib/mortgage/scenario-form";
import { createClient } from "@/lib/supabase/client";

type DialogView = "choose" | "confirmSaveAsNew";
type Pending = "none" | "updating" | "savingNew";
type ToastKind = "none" | "updated" | "savedNew";

const TOAST_AUTO_DISMISS_MS = 4500;

export interface EditContext {
  id: string;
  name: string;
  /** The row's updated_at captured when edit mode began — an optimistic-
   * concurrency token only, never authorization. */
  expectedUpdatedAt: string;
}

interface EditScenarioSaveButtonProps {
  locale: Locale;
  buttonLabel: string;
  drafts: TrackDraft[];
  editContext: EditContext;
  labels: Dictionary["editScenarioDialog"];
  saveScenarioLabels: Pick<
    Dictionary["saveScenarioDialog"],
    "successMessage" | "viewSavedLink" | "dismissAriaLabel"
  >;
}

function messageForError(
  code: ScenarioActionError,
  labels: Dictionary["editScenarioDialog"],
): string {
  if (code === "invalid-name") return labels.nameInvalidMessage;
  if (code === "scenario-changed") return labels.scenarioChangedMessage;
  return labels.genericErrorMessage;
}

/**
 * Replaces the ordinary single-choice Save flow while editing a saved
 * scenario: the dialog always offers two explicit, named actions —
 * update the original row, or save the edits as a brand-new scenario —
 * never a hidden default overwrite. Mirrors SaveScenarioButton's
 * blocking-dialog-then-non-blocking-toast shape, but with two distinct
 * success paths.
 */
export default function EditScenarioSaveButton({
  locale,
  buttonLabel,
  drafts,
  editContext,
  labels,
  saveScenarioLabels,
}: EditScenarioSaveButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [view, setView] = useState<DialogView>("choose");
  const [name, setName] = useState(editContext.name);
  const [pending, setPending] = useState<Pending>("none");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<ToastKind>("none");
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!dialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDialogOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dialogOpen]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  function showToast(kind: "updated" | "savedNew") {
    setToastKind(kind);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(
      () => setToastKind("none"),
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

    setView("choose");
    setName(editContext.name);
    setErrorMessage(null);
    setToastKind("none");
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setDialogOpen(true);
  }

  async function handleUpdateOriginal() {
    setPending("updating");
    setErrorMessage(null);

    const result = await updateScenario({
      id: editContext.id,
      name,
      locale,
      tracks: drafts,
      expectedUpdatedAt: editContext.expectedUpdatedAt,
    });

    setPending("none");
    if (result.ok) {
      setDialogOpen(false);
      showToast("updated");
      return;
    }
    setErrorMessage(messageForError(result.error, labels));
  }

  function handleSaveAsNewClick() {
    setErrorMessage(null);
    // Only substitute the suggested name if the user hasn't already
    // customized the field — an explicit edit is always respected.
    if (name === editContext.name) {
      setName(buildNewVersionName(editContext.name, locale));
    }
    setView("confirmSaveAsNew");
  }

  async function handleConfirmSaveAsNew() {
    setPending("savingNew");
    setErrorMessage(null);

    const result = await createScenario({ name, locale, tracks: drafts });

    setPending("none");
    if (result.ok) {
      setDialogOpen(false);
      showToast("savedNew");
      return;
    }
    setErrorMessage(
      result.error === "invalid-name"
        ? labels.nameInvalidMessage
        : labels.genericErrorMessage,
    );
  }

  const busy = pending !== "none";

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90 sm:py-1.5"
      >
        {buttonLabel}
      </button>

      {dialogOpen && (
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
              htmlFor="edit-scenario-name"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              {labels.nameLabel}
            </label>
            <input
              id="edit-scenario-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={busy}
              maxLength={120}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            />

            {view === "choose" ? (
              <>
                <div className="mt-3 space-y-1">
                  {labels.explanation.map((line) => (
                    <p key={line} className="text-xs leading-5 text-slate-500">
                      {line}
                    </p>
                  ))}
                </div>

                {errorMessage && (
                  <p role="alert" className="mt-2 text-sm text-red-600">
                    {errorMessage}
                  </p>
                )}

                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleUpdateOriginal}
                    disabled={busy}
                    className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pending === "updating"
                      ? labels.updatingButton
                      : labels.updateOriginalButton}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAsNewClick}
                    disabled={busy}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    {labels.saveAsNewButton}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDialogOpen(false)}
                    disabled={busy}
                    className="rounded-lg px-4 py-2 text-sm text-slate-500 transition hover:text-slate-800 disabled:cursor-not-allowed"
                  >
                    {labels.cancelButton}
                  </button>
                </div>
              </>
            ) : (
              <>
                {errorMessage && (
                  <p role="alert" className="mt-2 text-sm text-red-600">
                    {errorMessage}
                  </p>
                )}
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setView("choose")}
                    disabled={busy}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    {labels.backButton}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSaveAsNew}
                    disabled={busy}
                    className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pending === "savingNew"
                      ? labels.savingAsNewButton
                      : labels.saveAsNewButton}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toastKind !== "none" && (
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
              <p className="text-sm font-medium text-slate-900">
                {toastKind === "updated"
                  ? labels.updateSuccessMessage
                  : saveScenarioLabels.successMessage}
              </p>
              <Link
                href={
                  toastKind === "updated"
                    ? `/${locale}/saved/${editContext.id}`
                    : `/${locale}/saved`
                }
                onClick={() => setToastKind("none")}
                className="mt-1 inline-block text-sm font-medium text-accent underline underline-offset-2"
              >
                {toastKind === "updated"
                  ? labels.viewScenarioLink
                  : saveScenarioLabels.viewSavedLink}
              </Link>
            </div>
            <button
              type="button"
              onClick={() => setToastKind("none")}
              aria-label={
                toastKind === "updated"
                  ? labels.dismissAriaLabel
                  : saveScenarioLabels.dismissAriaLabel
              }
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
