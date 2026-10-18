import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareScenarioSave } from "../compute";
import { createTrackDraft } from "@/lib/mortgage/scenario-form";
import { createFallbackForecastCurve } from "@/lib/market-data/mortgage-forecast-fallback";
import { assembleSnapshot } from "@/lib/market-data/derive";

const mocks = vi.hoisted(() => ({ rate: vi.fn(), fullMarket: vi.fn(), forecast: vi.fn(), makam: vi.fn() }));
vi.mock("@/lib/market-data/get-market-snapshot", () => ({ getCalculatorRateSnapshot: mocks.rate, getMarketSnapshot: mocks.fullMarket }));
vi.mock("@/lib/market-data/sources/boi-mortgage-forecast", () => ({ getMortgageForecastData: mocks.forecast }));
vi.mock("@/lib/market-data/sources/boi-makam", () => ({ getMakamAnchorData: mocks.makam }));
const curve = createFallbackForecastCurve("2026-10-18T08:00:00Z");
const track = () => createTrackDraft({ amount: "800000", years: "25", ratePercent: "4.8" });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rate.mockResolvedValue(assembleSnapshot({ boi: null, cpi: null, errors: [] }, new Date("2026-10-18T08:00:00Z")));
  mocks.forecast.mockResolvedValue({ curves: [curve], status: "fallback", errors: [], missingCurveIds: [] });
  mocks.makam.mockResolvedValue({ snapshots: [], status: "fallback", errors: [], missingSnapshotIds: [] });
});

describe("server-side save calculation", () => {
  it.each([{ name: "", tracks: [track()], error: "invalid-name" }, { name: "Valid", tracks: [], error: "invalid-scenario" }])("rejects invalid input before source work ($error)", async input => {
    expect(await prepareScenarioSave({ ...input, locale: "he" })).toEqual({ ok: false, error: input.error });
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.forecast).not.toHaveBeenCalled();
    expect(mocks.makam).not.toHaveBeenCalled();
  });

  it("recalculates server-side from tracks and never fetches the unused CBS snapshot", async () => {
    const result = await prepareScenarioSave({ name: " Test ", locale: "en", tracks: [track()] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("save rejected");
    expect(result.name).toBe("Test");
    expect(result.resultSnapshot.totalPrincipal).toBe(800000);
    expect(result.resultSnapshot.firstPayment).toBeCloseTo(4583.98, 2);
    expect(mocks.rate).toHaveBeenCalledOnce();
    expect(mocks.fullMarket).not.toHaveBeenCalled();
  });

  it("loads each distinct pinned reference once per request and preserves the original references", async () => {
    const pinned = createTrackDraft({ trackType: "prime", amount: "100000", years: "20", currentRatePercent: "4.5", forecastCurveId: curve.id });
    const result = await prepareScenarioSave({ name: "Pinned", locale: "he", tracks: [pinned, { ...pinned, id: "another" }] });
    expect(result.ok).toBe(true);
    expect(mocks.forecast).toHaveBeenCalledExactlyOnceWith([curve.id]);
    if (result.ok) expect(result.marketReferences.tracks.every(ref => ref.forecastCurveId === curve.id)).toBe(true);
  });
});
