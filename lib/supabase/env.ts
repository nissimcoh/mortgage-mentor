/**
 * Both values are browser-safe by design (Supabase's publishable/anon key
 * is meant to be public — Row Level Security, not secrecy, is what
 * protects the data). Never add a service-role/secret key here; nothing
 * in this app runs with elevated database rights.
 *
 * Read at module load (not per-request) since env vars don't change
 * between requests — only the Supabase client instances built from them
 * need to be request-scoped (see client.ts/server.ts/middleware.ts).
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");

// Supabase's current key-naming scheme (publishable/secret, replacing the
// older anon/service_role pair). The publishable key fills the same slot
// the client libraries call "anon key" — fully interchangeable.
export const SUPABASE_PUBLISHABLE_KEY = requireEnv(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
);
