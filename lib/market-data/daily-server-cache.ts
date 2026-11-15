import { unstable_cache } from "next/cache";

export const MARKET_CACHE_SECONDS = 86_400;
export const MARKET_FAILURE_RETRY_MS = 120_000;

/** How long a request waits for the refresh of an expired entry before it
 * falls back to the previous value. */
export const MARKET_EXPIRED_WAIT_MS = 4000;
// Next stamps its own copy slightly after `fetchedAt`; without slack an entry
// Next still calls fresh could look expired here.
const EXPIRY_SLACK_MS = 60_000;

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
  const refresh = async () => {
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
  };
  const read = unstable_cache(
    refresh,
    ["official-market-daily-v1", key],
    { revalidate: MARKET_CACHE_SECONDS },
  );
  return async () => {
    const entry = await read();
    if (Date.now() - Date.parse(entry.fetchedAt) <= MARKET_CACHE_SECONDS * 1000 + EXPIRY_SLACK_MS) return entry;
    // On a per-request page Next returns an expired entry at once and
    // refreshes it in the background, so the first visitor after a quiet day
    // would get yesterday's snapshot, flagged as stale. Join that same
    // refresh (it is already in flight in this worker) for a bounded time.
    // If the source is down or slow, keep the previous success; its date
    // then marks it as stale, which is the truth.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        refresh(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Official source refresh timed out")), MARKET_EXPIRED_WAIT_MS);
        }),
      ]);
    } catch {
      return entry;
    } finally {
      clearTimeout(timer);
    }
  };
}
