import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCurrent } from "../sources/fetch-current";
import { parseBoiRateCsv } from "../sources/bank-of-israel";

afterEach(() => vi.unstubAllGlobals());
describe("current official feeds", () => {
  it("retries transient failure, then reads the next update without persistent caching", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(new Response("3.5"))
      .mockResolvedValueOnce(new Response("3.25"));
    vi.stubGlobal("fetch", fetcher);
    const parse = async (r: Response) => Number(await r.text());
    expect(await fetchCurrent("https://example.test/rate", parse)).toBe(3.5);
    expect(await fetchCurrent("https://example.test/rate", parse)).toBe(3.25);
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [, options] of fetcher.mock.calls) expect(options.cache).toBe("no-store");
  });
  it("does not silently return old data when both attempts fail", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(fetchCurrent("https://example.test/rate", r => r.text())).rejects.toThrow("503");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("separates the effective rate date from the latest observation and ignores empty values", () => {
    expect(parseBoiRateCsv("SERIES_CODE,TIME_PERIOD,OBS_VALUE\nMNT_RIB_BOI_D,2026-09-02,3.5\nMNT_RIB_BOI_D,2026-09-03,3.25\nMNT_RIB_BOI_D,2026-09-12,3.25\nMNT_RIB_BOI_D,2026-09-13,")).toEqual({ratePercent:3.25,effectiveDate:"2026-09-03",lastObservationDate:"2026-09-12"});
  });
});

import { assembleSnapshot } from "../derive";
it("retains the successful source-check time and flags overdue daily snapshots", () => {
  const checkedAt = "2026-09-12T08:00:00Z";
  const input = {boi: {ratePercent:3.25,effectiveDate:"2026-09-03",lastObservationDate:"2026-09-12",fetchedAt:checkedAt}, cpi:null, errors:[]};
  const today = assembleSnapshot(input, new Date("2026-09-12T15:00:00Z"));
  const tomorrow = assembleSnapshot(input, new Date("2026-09-13T09:00:00Z"));
  expect(today.boiRate.fetchedAt).toBe(checkedAt);
  expect(today.boiRate.isStale).toBe(false);
  expect(tomorrow.boiRate.ratePercent).toBe(3.25);
  expect(tomorrow.boiRate.fetchedAt).toBe(checkedAt);
  expect(tomorrow.boiRate.isStale).toBe(true);
});
