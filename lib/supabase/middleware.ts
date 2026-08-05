import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

/**
 * Builds a mutable response wired to refresh the Supabase session cookie
 * for this request, for use from proxy.ts. Callers must call
 * `supabase.auth.getUser()` (never `getSession()`, which trusts a
 * possibly-stale cookie without revalidating) to actually trigger the
 * refresh, and must return the returned `response` (not a fresh
 * `NextResponse.next()`) so the refreshed cookie isn't discarded.
 */
export function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  return { response, supabase };
}
