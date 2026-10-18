import { afterEach, describe, expect, it, vi } from "vitest";
// Exercise per-worker coalescing independently of Next's persistent cache.
// No simulation here claims to test distributed cache locking or TTL behavior.
vi.mock("next/cache", () => ({ unstable_cache: (load: () => Promise<unknown>) => load }));
import { dailyServerCache, MARKET_FAILURE_RETRY_MS } from "../daily-server-cache";

afterEach(() => vi.useRealTimers());

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

describe("official source request bursts within a worker", () => {
  it("coalesces 200 overlapping cold reads into one source load", async () => {
    const source = deferred<{ rate: number }>();
    const load = vi.fn(() => source.promise);
    const read = dailyServerCache("burst", load);
    const requests = Array.from({ length: 200 }, () => read());
    await Promise.resolve();
    expect(load).toHaveBeenCalledOnce();
    source.resolve({ rate: 3.25 });
    const results = await Promise.all(requests);
    expect(results).toHaveLength(200);
    expect(results.every(result => result.value.rate === 3.25)).toBe(true);
    expect(new Set(results.map(result => result.fetchedAt)).size).toBe(1);
    expect(Number.isFinite(Date.parse(results[0].fetchedAt))).toBe(true);
  });

  it("shares one failure, suppresses repeated failures until the boundary, then recovers", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-18T10:00:00Z"));
    const source = deferred<number>();
    const load = vi.fn().mockReturnValueOnce(source.promise).mockResolvedValueOnce(7);
    const read = dailyServerCache("recover", load);
    const results = Promise.allSettled(Array.from({ length: 100 }, () => read()));
    const unavailable = new Error("provider unavailable");
    source.reject(unavailable);
    expect((await results).every(result => result.status === "rejected" && result.reason === unavailable)).toBe(true);
    expect(load).toHaveBeenCalledOnce();
    vi.setSystemTime(Date.now() + MARKET_FAILURE_RETRY_MS - 1);
    const suppressed = await Promise.allSettled(Array.from({length: 100}, () => read()));
    expect(suppressed.every(r => r.status === "rejected" && r.reason === unavailable)).toBe(true);
    expect(load).toHaveBeenCalledOnce();
    vi.setSystemTime(Date.now() + 1);
    expect((await read()).value).toBe(7);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps independent source loads isolated", async () => {
    const a = deferred<string>();
    const b = deferred<string>();
    const loadA = vi.fn(() => a.promise);
    const loadB = vi.fn(() => b.promise);
    const readA = dailyServerCache("source-a", loadA);
    const readB = dailyServerCache("source-b", loadB);
    const requestsA = Promise.all(Array.from({ length: 50 }, () => readA()));
    const requestsB = Promise.all(Array.from({ length: 50 }, () => readB()));
    b.resolve("B");
    expect((await requestsB).every(result => result.value === "B")).toBe(true);
    a.resolve("A");
    expect((await requestsA).every(result => result.value === "A")).toBe(true);
    expect(loadA).toHaveBeenCalledOnce();
    expect(loadB).toHaveBeenCalledOnce();
  });

  it("does not replace Next's refresh policy with an indefinite worker cache", async () => {
    const load = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("refreshed");
    const read = dailyServerCache("refresh", load);
    expect((await read()).value).toBe("first");
    expect((await read()).value).toBe("refreshed");
    expect(load).toHaveBeenCalledTimes(2);
  });
});


it("isolates a failed source from healthy sources and handles synchronous failures", async () => {
  vi.useFakeTimers({toFake:["Date"]});
  const failing = vi.fn().mockImplementationOnce(() => {throw new Error("offline");}).mockResolvedValue("recovered");
  const read = dailyServerCache("sync-failure", failing);
  const healthy = dailyServerCache("healthy", async () => "healthy");
  await expect(read()).rejects.toThrow("offline");
  await expect(read()).rejects.toThrow("offline");
  expect((await healthy()).value).toBe("healthy");
  expect(failing).toHaveBeenCalledOnce();
  vi.setSystemTime(Date.now() + MARKET_FAILURE_RETRY_MS);
  expect((await read()).value).toBe("recovered");
  expect((await read()).value).toBe("recovered");
  expect(failing).toHaveBeenCalledTimes(3);
});
