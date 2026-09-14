import { writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
// Explicit upstream diagnostic: bypass framework storage outside a Next request.
// Normal application requests use the real persistent daily cache.
vi.mock("next/cache", () => ({ unstable_cache: (load: () => Promise<unknown>) => load }));
import { getMarketSnapshot } from "../lib/market-data/get-market-snapshot";
import { getMortgageForecastData } from "../lib/market-data/sources/boi-mortgage-forecast";
import { getMakamAnchorData } from "../lib/market-data/sources/boi-makam";

// Opt-in integration check; regular unit tests never depend on the network.
it.skipIf(process.env.CHECK_OFFICIAL_DATA !== "1")("official source availability and freshness", async () => {
  const [market, forecast, makam] = await Promise.all([getMarketSnapshot(), getMortgageForecastData(), getMakamAnchorData()]);
  const curve = forecast.curves[0];
  const report = {checkedAt: new Date().toISOString(), rate:market.boiRate, prime:market.primeRate, cpi:market.cpi, forecast:{status:forecast.status,id:curve.id,published:curve.publicationDate,nominalMonths:curve.nominalZeroYieldsPercent.length,realMonths:curve.realZeroYieldsPercent.length,cpiMonths:curve.expectedCpiIndex.length},makam:makam.snapshots[0],errors:[...market.errors,...forecast.errors,...makam.errors]};
  writeFileSync("/tmp/mortgage-official-data-check.json", JSON.stringify(report,null,2));
  expect(market.boiRate.isLive).toBe(true);
  expect(market.boiRate.isStale).toBe(false);
  expect(market.cpi.isLive).toBe(true);
  expect(market.cpi.isStale).toBe(false);
  expect(forecast.status).toBe("live");
  expect(Date.now()-Date.parse(curve.publicationDate)).toBeLessThan(45*86400000);
  expect(curve.nominalZeroYieldsPercent).toHaveLength(360);
  expect(curve.realZeroYieldsPercent).toHaveLength(360);
  expect(curve.expectedCpiIndex).toHaveLength(361);
  expect(makam.status).toBe("live");
  expect(Date.now()-Date.UTC(makam.snapshots[0].referenceYear,makam.snapshots[0].referenceMonth-1,1)).toBeLessThan(75*86400000);
}, 35000);
