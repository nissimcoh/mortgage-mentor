import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stand-in for Next's Data Cache on a per-request page: while `stored` holds
// an expired entry it is returned at once and the loader runs in the
// background, as `unstable_cache` does outside static generation.
const cache = vi.hoisted(() => ({ stored: undefined as unknown, background: 0 }));
vi.mock("next/cache", () => ({
  unstable_cache: (load: () => Promise<unknown>) => async () => {
    if (cache.stored === undefined) return load();
    cache.background += 1;
    load().catch(() => {});
    return cache.stored;
  },
}));
import { dailyServerCache, MARKET_CACHE_SECONDS, MARKET_EXPIRED_WAIT_MS } from "../daily-server-cache";

const NOW = new Date("2026-11-15T09:00:00Z");
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  cache.stored = undefined;
  cache.background = 0;
});
afterEach(() => vi.useRealTimers());

describe("an expired daily entry on a per-request page", () => {
  it("waits for the refresh already in flight and returns today's value", async () => {
    cache.stored = { value: 3.5, fetchedAt: ago(MARKET_CACHE_SECONDS * 2) };
    const load = vi.fn().mockResolvedValue(3.25);
    const result = await dailyServerCache("expired", load)();
    expect(result).toEqual({ value: 3.25, fetchedAt: NOW.toISOString() });
    expect(cache.background).toBe(1);
    expect(load).toHaveBeenCalledOnce(); // joined, not fetched twice
  });

  it("keeps the previous value, with its old date, when the source fails", async () => {
    const previous = { value: 3.5, fetchedAt: ago(MARKET_CACHE_SECONDS * 2) };
    cache.stored = previous;
    const load = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    expect(await dailyServerCache("failing", load)()).toBe(previous);
  });

  it("stops waiting for a slow source and keeps the previous value", async () => {
    const previous = { value: 3.5, fetchedAt: ago(MARKET_CACHE_SECONDS * 2) };
    cache.stored = previous;
    const load = vi.fn(() => new Promise<number>(() => {}));
    const pending = dailyServerCache("slow", load)();
    await vi.advanceTimersByTimeAsync(MARKET_EXPIRED_WAIT_MS);
    expect(await pending).toBe(previous);
  });

  it("returns an entry from the last day as it is", async () => {
    const recent = { value: 3.25, fetchedAt: ago(MARKET_CACHE_SECONDS - 60) };
    cache.stored = recent;
    const load = vi.fn().mockResolvedValue(9);
    expect(await dailyServerCache("recent", load)()).toBe(recent);
    expect(load).toHaveBeenCalledOnce(); // only the stand-in's own background call
  });
});
