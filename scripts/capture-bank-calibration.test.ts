import { writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (load: () => Promise<unknown>) => load }));
import { getMortgageForecastData } from "../lib/market-data/sources/boi-mortgage-forecast";
import { getMakamAnchorData } from "../lib/market-data/sources/boi-makam";
import { getCalculatorRateSnapshot } from "../lib/market-data/get-market-snapshot";
import { createTrackDraft, parseTrackDraft } from "../lib/mortgage/scenario-form";
import { calculateScenarioSummary } from "../lib/mortgage";

// Explicit public-source diagnostic, never part of offline tests. Uses only
// synthetic inputs; does not contact Supabase or write to the bank's accounts.
// CAPTURE_BANK_CALIBRATION=1 npx vitest run scripts/capture-bank-calibration.test.ts
const endpoint = "https://ufapi.bankleumi.co.il/MortgageCalculate/api/MortgageCalculate/CalculateByProducts?appId=%27site%27";
const cases = [
  { type: "fixedUnlinked", code: 1, years: 20 },
  { type: "fixedLinked", code: 2, years: 20 },
  { type: "prime", code: 3, years: 20 },
  ...[[24, 14, 20], [30, 13, 20], [36, 15, 21], [60, 6, 25], [84, 5, 21], [120, 4, 20]].map(([reset, code, years]) => ({ type: "variableGovernmentBond", code, years, reset })),
  { type: "variableLinked", code: 7, years: 20, reset: 60 },
  { type: "variableMakam", code: 10, years: 20, reset: 12 },
];

it.skipIf(process.env.CAPTURE_BANK_CALIBRATION !== "1")("captures bank monthly references and reports differences without blessing mismatches", async () => {
  const [forecast, makam, rate, catalogResponse] = await Promise.all([
    getMortgageForecastData(), getMakamAnchorData(), getCalculatorRateSnapshot(),
    fetch("https://ufapi.bankleumi.co.il/MortgageCalculate/api/MortgageCalculate/productsCatalog?appId=%27site%27"),
  ]);
  expect(forecast.status).toBe("live");
  expect(makam.status).toBe("live");
  expect(rate.boiRate.isLive).toBe(true);
  expect(catalogResponse.ok).toBe(true);
  const catalog = await catalogResponse.json();
  const market = { boiRatePercent: rate.boiRate.ratePercent, curves: forecast.curves, makamSnapshots: makam.snapshots };
  const captures = [];
  for (const c of cases) {
    const product = catalog.products.find((p: { productCode: number }) => p.productCode === c.code);
    expect(product.paymentScheduleList.find((s: { scheduleId: number }) => s.scheduleId === 1).validPeriods).toContain(c.years);
    const draft = createTrackDraft({ trackType: c.type, amount: "500000", years: String(c.years), ratePercent: "4.5", currentRatePercent: "4.5", resetPeriodMonths: "reset" in c ? String(c.reset) : "", forecastMode: "official" });
    const input = parseTrackDraft(draft, market);
    expect(input).not.toBeNull();
    const request = { loans: [{ loanAmount: "500000", productCode: c.code, period: String(c.years), trackName: product.trackName, scheduleId: 1, interestRate: "4.5" }], returnPaymentDetails: true, calculatePrimeDaily: false };
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(15000) });
    expect(response.ok).toBe(true);
    const bank = (await response.json()).repaymentSummary;
    const monthly = bank.loansRepayment[0].monthlyPayments as { month: number; monthlyPayment: number; principalPaid: number; interestPaid: number }[];
    expect(monthly).toHaveLength(c.years * 12);
    const actual = calculateScenarioSummary({ tracks: [input!] });
    const differences = {
      currentFirst: actual.currentCombinedFirstPayment - bank.totalFirstPayment,
      highest: actual.maximumPayment - bank.totalHighestPayment,
      total: actual.totalPayment - bank.totalAmountPaid,
      irr: actual.forecastOverallRatePercent - bank.totalIrr,
      maxMonthly: Math.max(...monthly.map((m, i) => Math.abs(actual.trackSummaries[0].schedule[i].payment - m.monthlyPayment))),
    };
    captures.push({ case: c, request, bank, differences });
  }
  writeFileSync("/tmp/mortgage-bank-calibration.json", JSON.stringify({ capturedAt: new Date().toISOString(), endpoint, scope: "Synthetic public calculator references; bank does not disclose its curve ID. Differences are diagnostics, not acceptance.", market, captures }, null, 2));
}, 60000);
