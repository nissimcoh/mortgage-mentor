import { afterEach, expect, it, vi } from "vitest";
import { Workbook } from "exceljs";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  // Emulate successful persistent-cache reads, including JSON serialization.
  unstable_cache: (load: () => Promise<unknown>) => {
    let serialized: string | undefined;
    return async () => {
      if (serialized === undefined) serialized = JSON.stringify(await load());
      return JSON.parse(serialized);
    };
  },
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function workbookResponses(futureOnly = false) {
  const curves = new Workbook();
  for (const [name, length, base] of [["nominal", 360, 3.5], ["real", 360, 1.5], ["cpi", 361, 100]] as const) {
    const sheet = curves.addWorksheet(name);
    for (const type of futureOnly ? ["קלנדרי"] : ["מדדי", "קלנדרי"]) {
      sheet.addRow([2026, "ספטמבר", type, ...Array.from({ length }, (_, i) => base + i * 0.001)]);
    }
  }
  const schedule = new Workbook();
  const sheet = schedule.addWorksheet("schedule");
  sheet.addRow(["2026-09-17", 2026, "ספטמבר", "מדדי"]);
  sheet.addRow(["2026-10-05", 2026, "ספטמבר", "קלנדרי"]);
  const curveBytes = await curves.xlsx.writeBuffer();
  const scheduleBytes = await schedule.xlsx.writeBuffer();
  return { curveBytes, scheduleBytes };
}

it("activates a cached future curve at Israeli midnight without refetching, retaining pinned history and timestamps", async () => {
  const { curveBytes, scheduleBytes } = await workbookResponses();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T20:59:59Z"));
  const fetcher = vi.fn(async (url: string) => new Response(
    new Uint8Array(url.includes("The_data_publication") ? scheduleBytes : curveBytes),
  ));
  vi.stubGlobal("fetch", fetcher);
  const { getMortgageForecastData } = await import("../sources/boi-mortgage-forecast");
  const before = await getMortgageForecastData(["2026-09-calendar"]);
  expect(before.status).toBe("live");
  expect(before.curves.map(curve => curve.id)).toEqual(["2026-09-index"]);
  expect(before.missingCurveIds).toEqual(["2026-09-calendar"]);

  vi.setSystemTime(new Date("2026-10-05T21:00:00Z"));
  const after = await getMortgageForecastData(["2026-09-index", "unknown"]);
  expect(after.status).toBe("live");
  expect(after.curves.map(curve => curve.id)).toEqual(["2026-09-calendar", "2026-09-index"]);
  expect(after.missingCurveIds).toEqual(["unknown"]);
  expect(after.curves[0].fetchedAt).toBe("2026-10-05T20:59:59.000Z");
  expect(after.curves[0].realZeroYieldsPercent).toHaveLength(360);
  expect(after.curves[0].expectedCpiIndex).toHaveLength(361);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("does not cache an invalid workbook and retries after activation and the failure cooldown", async () => {
  const { curveBytes, scheduleBytes } = await workbookResponses(true);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T20:59:59Z"));
  const fetcher = vi.fn(async (url: string) => new Response(
    new Uint8Array(url.includes("The_data_publication") ? scheduleBytes : curveBytes),
  ));
  vi.stubGlobal("fetch", fetcher);
  const { getMortgageForecastData } = await import("../sources/boi-mortgage-forecast");
  expect((await getMortgageForecastData()).status).toBe("fallback");
  vi.setSystemTime(new Date("2026-10-05T21:00:00Z"));
  expect((await getMortgageForecastData()).status).toBe("fallback");
  expect(fetcher).toHaveBeenCalledTimes(2);
  vi.setSystemTime(new Date("2026-10-05T21:02:00Z"));
  expect((await getMortgageForecastData()).status).toBe("live");
  expect(fetcher).toHaveBeenCalledTimes(4);
});
