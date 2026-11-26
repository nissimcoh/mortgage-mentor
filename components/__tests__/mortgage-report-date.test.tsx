// @vitest-environment jsdom
import { act } from "react";
import { webcrypto } from "node:crypto";
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

it("makes one paid read for identical contents selected together and accepts a changed report with the same name", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const fetch = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, file: fixture(), issues: [] }) });
  vi.stubGlobal("fetch", fetch);
  await mount(<MyMortgage {...props} initialSaved={null} readingAvailable />);
  expect(document.querySelector("summary")?.textContent).toBe(labels.reportHelpTitle);
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  const pdf = (name: string, contents: string) => {
    const file = new File([contents], name, { type: "application/pdf" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode(contents).buffer });
    return file;
  };
  Object.defineProperty(input, "files", { value: [pdf("report.pdf", "123"), pdf("copy.pdf", "123"), pdf("report.pdf", "124")] });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
  expect(document.querySelector('[role="status"]')?.textContent).toContain("כבר ברשימה");
  expect(document.querySelectorAll('li input[type="date"]')).toHaveLength(4);
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
  // Same setup as the duplicate test: Node's crypto and a readable File, so
  // the local digest step behaves the same in every test run.
  vi.stubGlobal("crypto", webcrypto);
  const pdf = new File(["pdf"], "report.pdf", { type: "application/pdf" });
  Object.defineProperty(pdf, "arrayBuffer", { value: async () => new TextEncoder().encode("pdf").buffer });
  Object.defineProperty(input, "files", { value: [pdf] });
  // Reading is async (hashing, fetch); wait for it rather than for one tick.
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
  // Reading is async (digest, fetch): let React flush between checks.
  await vi.waitFor(async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    button(labels.confirmButton);
  });

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

it("settles a track without a printed total from its parts, and keeps an incomplete schedule out of forecasts", async () => {
  const loans = fixture().loans;
  loans[1].tracks[0].balance.totalToSettle = null;
  loans[1].reportedTotals.totalToSettle = null;
  await mount(<MyMortgage {...props} initialSaved={{ loans, updatedAt: "2026-06-01" }} readingAvailable />);
  expect(document.body.textContent).not.toContain(labels.compareIncomplete);
  expect(document.querySelector('a[href*="track1Amount"]')).not.toBeNull();
  expect(document.querySelector("#existing-forecast-heading")).not.toBeNull();
  await unmount();
  loans[1].tracks[0].endDate = "2020-01-01";
  await mount(<MyMortgage {...props} initialSaved={{ loans, updatedAt: "2026-06-01" }} readingAvailable />);
  expect(document.body.textContent).toContain(labels.forecastIncomplete);
  expect(document.body.textContent).not.toContain(labels.forecastNextPayment);
});

it("edits the saved mortgage in place, without a report reader", async () => {
  const loans = fixture().loans;
  save.mockResolvedValueOnce({ ok: true, updatedAt: "2026-06-02T00:00:00Z" });
  await mount(<MyMortgage {...props} initialSaved={{ loans, updatedAt: "2026-06-01T00:00:00Z" }} readingAvailable={false} />);
  await click(button(labels.editSaved));
  expect(document.querySelector('input[type="file"]')).toBeNull();
  expect(document.body.textContent).toContain(labels.savedFileName);
  await click(button(labels.confirmButton));
  await click(button(labels.saveReplaceButton));
  expect(save).toHaveBeenCalledWith(expect.any(Array), "2026-06-01T00:00:00Z");
  expect(document.querySelector("#existing-forecast-heading")).not.toBeNull();
  expect(document.querySelector("#payoff-files-heading")).toBeNull();
});
