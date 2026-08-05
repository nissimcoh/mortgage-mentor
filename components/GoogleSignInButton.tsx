"use client";

import { useState } from "react";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "loading" | "error";

interface GoogleSignInButtonProps {
  locale: Locale;
  next: string;
  labels: Pick<
    Dictionary["signinPage"],
    "continueWithGoogleButton" | "signInErrorMessage"
  >;
}

/** Google OAuth sign-in. Session lands via
 * app/[locale]/auth/callback/route.ts (PKCE code exchange), which restores
 * `next`. */
export default function GoogleSignInButton({
  locale,
  next,
  labels,
}: GoogleSignInButtonProps) {
  const [status, setStatus] = useState<Status>("idle");

  async function handleClick() {
    setStatus("loading");

    const redirectTo = new URL(`/${locale}/auth/callback`, window.location.origin);
    redirectTo.searchParams.set("next", next);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo.toString() },
    });

    if (error) setStatus("error");
    // On success the browser navigates away to Google, so no "idle" reset.
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "loading"}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-6 py-2.5 text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        <GoogleIcon />
        {labels.continueWithGoogleButton}
      </button>

      {status === "error" && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {labels.signInErrorMessage}
        </p>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 18 18"
      className="h-4 w-4 shrink-0"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
      />
    </svg>
  );
}
