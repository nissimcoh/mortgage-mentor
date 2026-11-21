// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import he from "@/app/[locale]/dictionaries/he.json";
import { fictionalTwoLoanFile } from "@/lib/payoff-report/__tests__/fixtures";
import { prepareForConfirm, parsePayoffReportFile, simulateExistingMortgage, formatMoney } from "@/lib/payoff-report";
import MyMortgage from "../MyMortgage";
import { button, click, mount, type, unmount } from "./dom-helpers";

const save = vi.hoisted(() => vi.fn());
vi.mock("@/lib/payoff-report/actions", () => ({ saveMyMortgage: save, deleteMyMortgage: vi.fn() }));
vi.mock("@/lib/scenarios/comparison-actions", () => ({ loadComparisonPayments: vi.fn() }));
const labels = he.payoffPage;
const market = { boiRatePercent: 3, nominalZeroYieldsPercent: [], realZeroYieldsPercent: [], expectedCpiIndex: [] };
const props = { locale: "he" as const, labels, market, calculatorLabels: he.calculator, comparisonLabels: he.savedComparison, mixes: [] };

function fixture() {
  const parsed = parsePayoffReportFile(fictionalTwoLoanFile(), "report.pdf");
  if (!parsed.ok) throw Error("fixture must parse");
  return prepareForConfirm(parsed.file);
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});

afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
  save.mockReset();
});

it("requires the missing balance date on upload, retains the other loan, then forecasts both", async () => {
  const report = fixture();
  report.loans[1].asOfDate = null;
  const fetch = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, file: report, issues: [] }) });
  vi.stubGlobal("fetch", fetch);
  Element.prototype.scrollIntoView = vi.fn();
  await mount(<MyMortgage {...props} initialSaved={null} readingAvailable />);
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [new File(["pdf"], "report.pdf", { type: "application/pdf" })] });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });

  expect(button(labels.confirmButton).disabled).toBe(true);
  expect(document.querySelector("#existing-forecast-heading")).toBeNull();
  const fields = document.querySelectorAll<HTMLInputElement>('li input[type="date"]');
  expect(fields[0].value).toBe(report.loans[0].asOfDate);
  expect(fields[1].value).toBe("");
  await type(fields[1], "2026-03-11");
  expect(button(labels.confirmButton).disabled).toBe(false);
  await click(button(labels.confirmButton));
  const corrected = [report.loans[0], { ...report.loans[1], asOfDate: "2026-03-11" }];
  const forecast = simulateExistingMortgage(corrected, market);
  expect(forecast.tracks).toHaveLength(3);
  expect(document.querySelector('[aria-labelledby="existing-forecast-heading"] dd')?.textContent)
    .toBe(formatMoney(forecast.totals.firstMonthPayment, "he"));
  await click(button(labels.editAgain));
  expect(document.querySelectorAll<HTMLInputElement>('li input[type="date"]')[1].value).toBe("2026-03-11");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("repairs a legacy saved mortgage without a reader, keeps the draft on failure and restores the forecast", async () => {
  const loans = fixture().loans;
  const legacy = { loans: [{ ...loans[0], asOfDate: null }, loans[1]], updatedAt: "2026-06-01T00:00:00Z" };
  save.mockResolvedValueOnce({ ok: false, error: "failed" }).mockResolvedValueOnce({ ok: true, updatedAt: "2026-06-02T00:00:00Z" });
  await mount(<MyMortgage {...props} initialSaved={legacy} readingAvailable={false} />);
  expect(button(labels.repairDateSave).disabled).toBe(true);
  expect(document.querySelector("#existing-forecast-heading")).toBeNull();
  await type(document.querySelector<HTMLInputElement>('input[type="date"]')!, loans[0].asOfDate!);
  await click(button(labels.repairDateSave));
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(labels.saveError);
  await click(button(labels.repairDateSave));
  expect(save).toHaveBeenLastCalledWith(loans, legacy.updatedAt);
  expect(document.querySelector("#existing-forecast-heading")?.textContent).toBe(labels.forecastHeading);
  expect(document.querySelector('input[type="date"]')).toBeNull();
});
