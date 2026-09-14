import { unstable_cache } from "next/cache";

export const MARKET_CACHE_SECONDS = 86_400;

/** Persistent Next Data Cache, shared across page requests and server restarts.
 * Only validated successes enter the cache. A failed revalidation leaves the
 * previous success intact. Keep fallback handling OUTSIDE this function.
 * This project does not enable Cache Components, so it uses the supported
 * Data Cache API rather than changing the application's rendering model. */
export function dailyServerCache<T>(key: string, load: () => Promise<T>) {
  let inFlight: Promise<{ value: T; fetchedAt: string }> | undefined;
  return unstable_cache(
    async () => {
      // Coalesce cold or expired requests within the same server worker.
      if (!inFlight) {
        inFlight = load()
          .then((value) => ({ value, fetchedAt: new Date().toISOString() }))
          .finally(() => { inFlight = undefined; });
      }
      return inFlight;
    },
    ["official-market-daily-v1", key],
    { revalidate: MARKET_CACHE_SECONDS },
  );
}
