import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

/**
 * Server-side Supabase client for Server Components, Server Actions, and
 * Route Handlers. Must be created fresh per request (never module-level)
 * since it's bound to that request's cookie jar.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component render, where cookies() is
          // read-only — safe to ignore because proxy.ts's session refresh
          // already keeps the session cookie fresh on every navigation.
        }
      },
    },
  });
}
