"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { Dictionary } from "@/app/[locale]/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { signOut } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/client";

type Status = "loading" | "signedOut" | "signedIn";

interface AuthState {
  status: Status;
  user: User | null;
}

/**
 * Presentation-only client auth state — never used for authorization.
 * /saved stays protected server-side regardless of what this reports.
 *
 * Re-checks on every navigation, not just via onAuthStateChange: the
 * sign-out server action (lib/auth/actions.ts) clears the session cookie
 * from a plain form submission, which this browser client's own event
 * stream doesn't observe (it only fires for auth calls made through this
 * same client instance). Re-reading `next/navigation`'s pathname after
 * the action's redirect lands is what makes sign-out actually flip the
 * header back, without needing a full page reload.
 */
function useHeaderAuthState(): AuthState {
  const pathname = usePathname();
  const [state, setState] = useState<AuthState>({
    status: "loading",
    user: null,
  });

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setState({ status: data.user ? "signedIn" : "signedOut", user: data.user });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setState({
        status: session?.user ? "signedIn" : "signedOut",
        user: session?.user ?? null,
      });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [pathname]);

  return state;
}

function getDisplayName(user: User): string | null {
  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const fullName = metadata?.full_name;
  if (typeof fullName === "string" && fullName.trim()) return fullName;
  const name = metadata?.name;
  if (typeof name === "string" && name.trim()) return name;
  return null;
}

function getFirstName(displayName: string | null): string | null {
  return displayName?.trim().split(/\s+/)[0] ?? null;
}

function getAvatarUrl(user: User): string | null {
  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const avatarUrl = metadata?.avatar_url;
  return typeof avatarUrl === "string" && avatarUrl ? avatarUrl : null;
}

interface HeaderAuthStatusProps {
  locale: Locale;
  signInLabel: string;
  labels: Dictionary["accountMenu"];
}

export default function HeaderAuthStatus({
  locale,
  signInLabel,
  labels,
}: HeaderAuthStatusProps) {
  const { status, user } = useHeaderAuthState();

  if (status === "loading") {
    return (
      <span
        aria-hidden="true"
        className="block h-9 w-9 animate-pulse rounded-full bg-slate-100 md:w-24"
      />
    );
  }

  if (status === "signedOut" || !user) {
    return (
      <Link
        href={`/${locale}/signin`}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
      >
        {signInLabel}
      </Link>
    );
  }

  return <AccountMenu user={user} locale={locale} labels={labels} />;
}

interface AccountMenuProps {
  user: User;
  locale: Locale;
  labels: Dictionary["accountMenu"];
}

function AccountMenu({ user, locale, labels }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const displayName = getDisplayName(user);
  const firstName = getFirstName(displayName);
  const avatarUrl = getAvatarUrl(user);
  const initial = (displayName ?? user.email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={labels.menuLabel}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 ps-1 pe-2 text-sm text-slate-700 shadow-sm transition hover:bg-slate-50 md:pe-3"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Google-hosted avatar URL, not known at build time
          <img
            src={avatarUrl}
            alt={labels.avatarAlt}
            referrerPolicy="no-referrer"
            className="h-7 w-7 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
            {initial}
          </span>
        )}
        {firstName && (
          <span className="hidden max-w-24 truncate md:inline">{firstName}</span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md"
        >
          {(displayName || user.email) && (
            <div className="border-b border-slate-100 px-4 py-3">
              {displayName && (
                <p className="truncate text-sm font-medium text-slate-900">
                  {displayName}
                </p>
              )}
              {user.email && (
                <p className="truncate text-xs text-slate-500">{user.email}</p>
              )}
            </div>
          )}

          <Link
            role="menuitem"
            href={`/${locale}/saved`}
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
          >
            {labels.savedScenarios}
          </Link>

          <form action={signOut.bind(null, locale)}>
            <button
              type="submit"
              role="menuitem"
              className="block w-full px-4 py-2.5 text-start text-sm text-slate-700 transition hover:bg-slate-50"
            >
              {labels.signOut}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
