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
import LegalNotice from "./LegalNotice";
import ModalDialog from "./ModalDialog";

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
  onUpdated: (saved: { name: string; updatedAt: string }) => void;
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
  onUpdated,
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const savingRef = useRef(false);

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

    setView("choose");
    setName(editContext.name);
    setErrorMessage(null);
    setToastKind("none");
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setDialogOpen(true);
  }

  async function handleUpdateOriginal() {
    if (savingRef.current) return;
    savingRef.current = true;
    setPending("updating");
    setErrorMessage(null);
    try {
      const result = await updateScenario({
        id: editContext.id,
        name,
        locale,
        tracks: drafts,
        expectedUpdatedAt: editContext.expectedUpdatedAt,
      });

      setPending("none");
      if (result.ok) {
        onUpdated({ name: result.name, updatedAt: result.updatedAt });
        setDialogOpen(false);
        showToast("updated");
        return;
      }
      if (result.error === "unauthenticated") {
        setDialogOpen(false);
        redirectToSignIn();
        return;
      }
      setErrorMessage(messageForError(result.error, labels));
    } catch { setErrorMessage(labels.genericErrorMessage); }
    finally { savingRef.current = false; setPending("none"); }
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
    if (savingRef.current) return;
    savingRef.current = true;
    setPending("savingNew");
    setErrorMessage(null);
    try {
      const result = await createScenario({ name, locale, tracks: drafts });

      setPending("none");
      if (result.ok) {
        setDialogOpen(false);
        showToast("savedNew");
        return;
      }
      if (result.error === "unauthenticated") {
        setDialogOpen(false);
        redirectToSignIn();
        return;
      }
      setErrorMessage(
        result.error === "invalid-name"
          ? labels.nameInvalidMessage
          : labels.genericErrorMessage,
      );
    } catch { setErrorMessage(labels.genericErrorMessage); }
    finally { savingRef.current = false; setPending("none"); }
  }

  const busy = pending !== "none";

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

      {dialogOpen && (
        <ModalDialog label={labels.title} busy={busy} onClose={() => setDialogOpen(false)} returnFocusRef={triggerRef}>
          <form onSubmit={event => {
            event.preventDefault();
            // Updating the original vs saving a copy must be an explicit choice.
            if (view === "confirmSaveAsNew") void handleConfirmSaveAsNew();
          }} className="glass-form glass-panel max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-lg">
            <h2 className="mb-3 text-lg font-bold text-slate-900">
              {labels.title}
            </h2>

            <LegalNotice locale={locale} kind="save" />
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
                    type="submit"
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
          </form>
        </ModalDialog>
      )}

      {toastKind !== "none" && (
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
