"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import {
  deleteScenario,
  duplicateScenario,
  renameScenario,
} from "@/lib/scenarios/actions";
import type { ScenarioActionError } from "@/lib/scenarios/contract";

type DropdownView = "menu" | "confirmDelete";
type Pending = "none" | "renaming" | "duplicating" | "deleting";

interface ScenarioActionsMenuProps {
  id: string;
  currentName: string;
  labels: Dictionary["savedPage"];
}

function messageForError(
  code: ScenarioActionError,
  labels: Dictionary["savedPage"],
): string {
  if (code === "invalid-name") return labels.renameNameInvalidMessage;
  if (code === "not-found") return labels.notFoundMessage;
  return labels.actionErrorMessage;
}

/**
 * Compact overflow menu (Rename / Duplicate / Delete) for one saved-
 * scenario card — keeps the card itself down to a single visible primary
 * action (Open). Delete's confirmation replaces the menu's own content
 * in place, matching the existing account-menu/language-switcher click-
 * outside + Escape pattern already used elsewhere in the app. Rename
 * opens its own small dialog (it needs text input); a successful rename,
 * duplicate, or delete calls router.refresh() so the server-rendered
 * list reflects it without a full reload.
 */
export default function ScenarioActionsMenu({
  id,
  currentName,
  labels,
}: ScenarioActionsMenuProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [dropdownView, setDropdownView] = useState<DropdownView>("menu");
  const [menuError, setMenuError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>("none");

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(currentName);
  const [renameError, setRenameError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!renameOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRenameOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [renameOpen]);

  function closeMenu() {
    setOpen(false);
    setDropdownView("menu");
    setMenuError(null);
  }

  function openRenameDialog() {
    setOpen(false);
    setRenameValue(currentName);
    setRenameError(null);
    setRenameOpen(true);
  }

  function toggleMenu() {
    if (open) {
      closeMenu();
      return;
    }
    setDropdownView("menu");
    setMenuError(null);
    setOpen(true);
  }

  async function handleDuplicate() {
    setPending("duplicating");
    setMenuError(null);
    const result = await duplicateScenario(id);
    setPending("none");
    if (result.ok) {
      closeMenu();
      router.refresh();
      return;
    }
    setMenuError(messageForError(result.error, labels));
  }

  async function handleDeleteConfirm() {
    setPending("deleting");
    setMenuError(null);
    const result = await deleteScenario(id);
    setPending("none");
    if (result.ok) {
      closeMenu();
      router.refresh();
      return;
    }
    setMenuError(messageForError(result.error, labels));
  }

  async function handleRenameSave() {
    setPending("renaming");
    setRenameError(null);
    const result = await renameScenario({ id, name: renameValue });
    setPending("none");
    if (result.ok) {
      setRenameOpen(false);
      router.refresh();
      return;
    }
    setRenameError(messageForError(result.error, labels));
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggleMenu}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={labels.menuLabel}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 sm:h-9 sm:w-9"
      >
        <span aria-hidden="true" className="text-lg leading-none">
          ⋮
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md"
        >
          {dropdownView === "menu" ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={openRenameDialog}
                className="block w-full px-4 py-2.5 text-start text-sm text-slate-700 transition hover:bg-slate-50"
              >
                {labels.renameAction}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={handleDuplicate}
                disabled={pending === "duplicating"}
                className="block w-full px-4 py-2.5 text-start text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                {pending === "duplicating"
                  ? labels.duplicatingAction
                  : labels.duplicateAction}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setDropdownView("confirmDelete")}
                className="block w-full px-4 py-2.5 text-start text-sm text-red-600 transition hover:bg-red-50"
              >
                {labels.deleteButton}
              </button>
              {menuError && (
                <p role="alert" className="px-4 py-2 text-xs text-red-600">
                  {menuError}
                </p>
              )}
            </>
          ) : (
            <div className="p-3">
              <p className="mb-2 text-sm text-slate-700">
                {labels.deleteConfirmPrompt}
              </p>
              {menuError && (
                <p role="alert" className="mb-2 text-xs text-red-600">
                  {menuError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDropdownView("menu")}
                  disabled={pending === "deleting"}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  {labels.deleteConfirmCancel}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={pending === "deleting"}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                >
                  {pending === "deleting"
                    ? labels.deletingAction
                    : labels.deleteConfirmYes}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {renameOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={labels.renameDialogTitle}
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 px-4 pb-4 sm:items-center sm:pb-0"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-lg">
            <h2 className="mb-3 text-lg font-bold text-slate-900">
              {labels.renameDialogTitle}
            </h2>
            <label
              htmlFor={`rename-scenario-${id}`}
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              {labels.renameNameLabel}
            </label>
            <input
              id={`rename-scenario-${id}`}
              type="text"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              disabled={pending === "renaming"}
              maxLength={120}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            />

            {renameError && (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {renameError}
              </p>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameOpen(false)}
                disabled={pending === "renaming"}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                {labels.renameCancelButton}
              </button>
              <button
                type="button"
                onClick={handleRenameSave}
                disabled={pending === "renaming"}
                className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending === "renaming"
                  ? labels.renamingAction
                  : labels.renameSaveButton}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
