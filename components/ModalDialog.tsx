"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

/** Native modal supplies focus containment and makes the background inert. */
export default function ModalDialog({ label, busy = false, onClose, returnFocusRef, children }: {
  label: string; busy?: boolean; onClose: () => void; returnFocusRef?: RefObject<HTMLElement | null>; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const returnTarget = returnFocusRef?.current ?? opener;
    dialog.showModal();
    dialog.querySelector<HTMLInputElement>("input:not([disabled])")?.focus();
    return () => {
      dialog.close();
      if (returnTarget?.isConnected) returnTarget.focus();
    };
  }, [returnFocusRef]);
  useEffect(() => {
    if (busy) ref.current?.focus();
    else ref.current?.querySelector<HTMLInputElement>("input:not([disabled])")?.focus();
  }, [busy]);

  return <dialog ref={ref} aria-label={label} aria-modal="true" aria-busy={busy} tabIndex={-1}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const dialog = ref.current!;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'))
        .filter(element => element.getClientRects().length > 0 && !element.closest("[inert]"));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (busy || !first) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement as HTMLElement))) {
        event.preventDefault();
        first.focus();
      }
    }}
    className="mortgage-modal fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto border-0 bg-transparent p-4 text-slate-900 outline-none backdrop:bg-slate-900/40">
    <div className="flex min-h-full items-end justify-center sm:items-center">{children}</div>
  </dialog>;
}
