import { afterEach, expect, it, vi } from "vitest";
import { assembleSnapshot } from "../derive";
import { getCalculatorRateSnapshot, getMarketSnapshot } from "../get-market-snapshot";

const mocks = vi.hoisted(() => ({ boi: vi.fn(), cpi: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../sources/bank-of-israel", () => ({ fetchBoiRate: mocks.boi }));
vi.mock("../sources/cbs", () => ({ fetchLatestCpi: mocks.cpi }));

afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

it("loads the calculator rate independently while the home still waits for CBS", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T09:00:00Z"));
  const boi = { ratePercent: 3.5, effectiveDate: "2026-09-01", lastObservationDate: "2026-10-15", fetchedAt: "2026-10-16T08:00:00Z" };
  mocks.boi.mockResolvedValue(boi);
  let releaseCpi!: (value: null) => void;
  mocks.cpi.mockReturnValue(new Promise(resolve => { releaseCpi = resolve; }));

  const calculator = await getCalculatorRateSnapshot();
  expect(mocks.cpi).not.toHaveBeenCalled();
  const expected = assembleSnapshot({ boi, cpi: null, errors: [] }, new Date());
  expect(calculator).toEqual({ boiRate: expected.boiRate, nextDecision: expected.nextDecision, fetchedAt: expected.fetchedAt });
  expect(calculator.boiRate.isLive).toBe(true);

  let completed = false;
  const home = getMarketSnapshot().then(value => { completed = true; return value; });
  await Promise.resolve();
  expect(mocks.cpi).toHaveBeenCalledOnce();
  expect(completed).toBe(false);
  releaseCpi(null);
  expect((await home).boiRate).toEqual(calculator.boiRate);
});

it("retains the dated fallback when the rate source fails", async () => {
  mocks.boi.mockRejectedValue(new Error("unavailable"));
  const calculator = await getCalculatorRateSnapshot();
  const expected = assembleSnapshot({ boi: null, cpi: null, errors: [] }, new Date());
  expect(calculator.boiRate).toEqual(expected.boiRate);
  expect(calculator.boiRate.isLive).toBe(false);
  expect(mocks.cpi).not.toHaveBeenCalled();
});
