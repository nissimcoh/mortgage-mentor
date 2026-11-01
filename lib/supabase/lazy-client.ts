/** Loads the browser Supabase client on first use. Every page renders the
 * header's auth status, so a static import would put the whole SDK (auth,
 * realtime, storage) into every page's hydration bundle; importing it on
 * demand lets pages hydrate first and fetch the SDK in parallel.
 *
 * Concurrent callers share one module import. A failed chunk load is not
 * remembered, so the next call retries it. */
let clientModule: Promise<typeof import("@/lib/supabase/client")> | undefined;

export function loadSupabaseClient() {
  clientModule ??= import("@/lib/supabase/client").catch((error: unknown) => {
    clientModule = undefined;
    throw error;
  });
  return clientModule.then((module) => module.createClient());
}
