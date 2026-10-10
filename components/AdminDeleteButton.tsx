"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminDeleteScenario, adminDeleteUser } from "@/lib/admin/actions";
import type { AdminActionError } from "@/lib/admin/contract";

interface AdminDeleteButtonProps {
  kind: "scenario" | "user";
  id: string;
  confirmMessage: string;
  buttonLabel: string;
  deletingLabel: string;
  errorMessages: Record<AdminActionError, string>;
}

/**
 * Shared delete control for both admin tables. Uses a native confirm()
 * rather than a custom dialog — this page is only ever seen by the site
 * owner, so the extra chrome a customer-facing confirm modal would need
 * isn't worth building here. router.refresh() re-runs the Server
 * Component after a successful delete. Currently not mounted by the
 * read-only administration page.
 */
export default function AdminDeleteButton({
  kind,
  id,
  confirmMessage,
  buttonLabel,
  deletingLabel,
  errorMessages,
}: AdminDeleteButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleClick() {
    if (!window.confirm(confirmMessage)) return;
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const result =
          kind === "scenario"
            ? await adminDeleteScenario(id)
            : await adminDeleteUser(id);
        if (result.ok) {
          router.refresh();
          return;
        }
        setErrorMessage(errorMessages[result.error]);
      } catch {
        setErrorMessage(errorMessages["database-error"]);
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? deletingLabel : buttonLabel}
      </button>
      {errorMessage && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
