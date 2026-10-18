import { unstable_cache } from "next/cache";

export const MARKET_CACHE_SECONDS = 86_400;
export const MARKET_FAILURE_RETRY_MS = 120_000;

/** Persistent Next Data Cache, shared across page requests and server restarts.
 * Only validated successes enter the cache. A failed revalidation leaves the
 * previous success intact. Keep fallback handling OUTSIDE this function.
 * This project does not enable Cache Components, so it uses the supported
 * Data Cache API rather than changing the application's rendering model. */
export function dailyServerCache<T>(key: string, load: () => Promise<T>) {
  let inFlight: Promise<{ value: T; fetchedAt: string }> | undefined;
  // Per-source, per-worker cooldown; never store a failure/fallback in the
  // persistent Data Cache or displace a previously successful snapshot.
  let failure: { reason: unknown; retryAt: number } | undefined;
  return unstable_cache(
    async () => {
      if (failure && Date.now() < failure.retryAt) throw failure.reason;
      // Coalesce cold or expired requests within the same server worker.
      if (!inFlight) {
        inFlight = Promise.resolve().then(load)
          .then((value) => {
            failure = undefined;
            return { value, fetchedAt: new Date().toISOString() };
          })
          .catch((reason: unknown) => {
            failure = { reason, retryAt: Date.now() + MARKET_FAILURE_RETRY_MS };
            throw reason;
          })
          .finally(() => { inFlight = undefined; });
      }
      return inFlight;
    },
    ["official-market-daily-v1", key],
    { revalidate: MARKET_CACHE_SECONDS },
  );
}
