/**
 * Both values are browser-safe by design (Supabase's publishable/anon key
 * is meant to be public — Row Level Security, not secrecy, is what
 * protects the data). Never add a service-role/secret key here; nothing
 * in this app runs with elevated database rights.
 *
 * Read at module load (not per-request) since env vars don't change
 * between requests — only the Supabase client instances built from them
 * need to be request-scoped (see client.ts/server.ts/middleware.ts).
 *
 * NEXT_PUBLIC_* values MUST be referenced as static `process.env.X`
 * member expressions, never `process.env[name]`. Next.js inlines
 * NEXT_PUBLIC_* values into the client bundle via a build-time textual
 * replacement of that exact static pattern; a dynamic/bracket lookup
 * can't be found by that replacement, so it silently falls through to a
 * runtime `process.env` lookup in the browser instead — which is empty
 * there. That previously crashed every client component importing the
 * Supabase browser client (this file is eager top-level `const`, so the
 * throw below fired at module-evaluation time, before hydration).
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);

// Supabase's current key-naming scheme (publishable/secret, replacing the
// older anon/service_role pair). The publishable key fills the same slot
// the client libraries call "anon key" — fully interchangeable.
export const SUPABASE_PUBLISHABLE_KEY = requireEnv(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  supabasePublishableKey,
);
