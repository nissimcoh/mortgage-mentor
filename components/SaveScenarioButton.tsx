"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { createScenario } from "@/lib/scenarios/actions";
import type { TrackDraft } from "@/lib/mortgage/scenario-form";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "open" | "saving" | "success" | "error";

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

  const [status, setStatus] = useState<Status>("idle");
  const [name, setName] = useState(labels.defaultName);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "open") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStatus("idle");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [status]);

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

    setName(labels.defaultName);
    setErrorMessage(null);
    setStatus("open");
  }

  async function handleSave() {
    setStatus("saving");
    setErrorMessage(null);

    const result = await createScenario({ name, locale, tracks: drafts });

    if (result.ok) {
      setStatus("success");
      return;
    }

    setErrorMessage(
      result.error === "invalidName"
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
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 sm:py-1.5"
      >
        {buttonLabel}
      </button>

      {(status === "open" || status === "saving" || status === "success") && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={labels.title}
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 px-4 pb-4 sm:items-center sm:pb-0"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-lg">
            {status === "success" ? (
              <>
                <p role="status" className="text-sm leading-6 text-emerald-700">
                  {labels.successMessage}
                </p>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <Link
                    href={`/${locale}/saved`}
                    className="text-sm font-medium text-slate-900 underline underline-offset-2"
                  >
                    {labels.viewSavedLink}
                  </Link>
                  <button
                    type="button"
                    onClick={() => setStatus("idle")}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100"
                  >
                    {labels.cancelButton}
                  </button>
                </div>
              </>
            ) : (
              <>
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
                    className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {status === "saving" ? labels.savingButton : labels.saveButton}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
