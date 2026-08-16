"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import { deleteScenario } from "@/lib/scenarios/actions";

type Status = "idle" | "confirming" | "deleting";

interface DeleteScenarioButtonProps {
  id: string;
  labels: Pick<
    Dictionary["savedPage"],
    "deleteButton" | "deleteConfirmPrompt" | "deleteConfirmYes" | "deleteConfirmCancel"
  >;
}

/**
 * Hard delete, per the approved product decision — no undo, no archive
 * flag. Ownership is enforced by RLS server-side; router.refresh() after
 * a successful delete is what makes the list (a Server Component read)
 * drop the row without a full page reload.
 */
export default function DeleteScenarioButton({
  id,
  labels,
}: DeleteScenarioButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");

  async function handleConfirm() {
    setStatus("deleting");
    const result = await deleteScenario(id);
    if (result.ok) {
      router.refresh();
      return;
    }
    setStatus("idle");
  }

  if (status === "idle") {
    return (
      <button
        type="button"
        onClick={() => setStatus("confirming")}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100"
      >
        {labels.deleteButton}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-slate-600">{labels.deleteConfirmPrompt}</span>
      <button
        type="button"
        onClick={() => setStatus("idle")}
        disabled={status === "deleting"}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
      >
        {labels.deleteConfirmCancel}
      </button>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={status === "deleting"}
        className="rounded-lg bg-red-600 px-3 py-1.5 text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
      >
        {labels.deleteConfirmYes}
      </button>
    </div>
  );
}
