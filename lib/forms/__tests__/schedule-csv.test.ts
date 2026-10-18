import { describe, expect, it } from "vitest";
import { Workbook } from "exceljs";
import { Readable } from "node:stream";
import he from "@/app/[locale]/dictionaries/he.json";
import en from "@/app/[locale]/dictionaries/en.json";
import { buildScheduleCsv } from "../schedule-csv";
import { calculateScenarioSummary } from "@/lib/mortgage/calculations";
import { scheduleBasisForMonth } from "@/lib/mortgage/schedule-certainty";
import type { MortgageTrackInput } from "@/lib/mortgage/types";

const tracks: MortgageTrackInput[] = [{ type: "fixedUnlinked", repaymentMethod: "spitzer", loanAmount: 800000, annualInterestRatePercent: 4.8, interestRateInputMode: "nominalAnnual", years: 25 }];
const schedule = calculateScenarioSummary({ tracks }).combinedSchedule;
const bases = schedule.map(row => scheduleBasisForMonth(tracks, row.month));

describe("schedule CSV", () => {
  it.each([he, en])("exports every engine value as a numeric cell, with Excel encoding and the displayed basis", dict => {
    const csv = buildScheduleCsv(schedule, bases, dict.calculator);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.slice(1).trim().split("\r\n");
    expect(lines).toHaveLength(301);
    expect(lines[0]).toContain(dict.calculator.monthHeader);
    for (let i = 0; i < schedule.length; i++) {
      const cells = lines[i + 1].split(",");
      expect(cells[1]).toBe(`"${dict.calculator.scheduleBasisContractual}"`);
      expect(cells.slice(2).map(Number)).toEqual([schedule[i].activeAnnualRatePercent, schedule[i].payment, schedule[i].principalPayment, schedule[i].interestPayment, schedule[i].remainingBalance]);
    }
  });
  it("retains all forecast classifications and does not invent missing rates or label unknown rows contractual", () => {
    const csv = buildScheduleCsv(Array(4).fill({ month: 1, payment: 1, principalPayment: 1, interestPayment: 0, remainingBalance: 0 }), ["rate", "index", "rateAndIndex"], en.calculator);
    for (const label of [en.calculator.scheduleBasisRate, en.calculator.scheduleBasisIndex, en.calculator.scheduleBasisRateAndIndex, en.calculator.csvEstimated]) expect(csv).toContain(`"${label}"`);
    expect(csv).not.toContain("undefined");
    expect(csv).toContain(",,1,1,0,0");
  });
  it("quotes commas, quotes and newlines and neutralizes formula-like text", () => {
    const labels = { ...en.calculator, monthHeader: 'Month, "number"\nnext', scheduleBasisContractual: '  =HYPERLINK("x")' };
    const csv = buildScheduleCsv(schedule.slice(0, 1), ["contractual"], labels, "@unsafe");
    expect(csv).toContain('"Month, ""number""\nnext"');
    expect(csv).toContain('"\'  =HYPERLINK(""x"")"');
    expect(csv).toContain('"\'@unsafe"');
  });
  it("round-trips Hebrew headers and numeric payments through the ExcelJS CSV reader", async () => {
    const csv = buildScheduleCsv(schedule, bases, he.calculator);
    const workbook = new Workbook();
    const sheet = await workbook.csv.read(Readable.from([csv]));
    expect(sheet.getRow(1).getCell(1).value).toBe(he.calculator.monthHeader);
    expect(sheet.rowCount).toBe(301);
    expect(sheet.getRow(2).getCell(4).value).toBe(schedule[0].payment);
    expect(sheet.getRow(301).getCell(7).value).toBe(0);
  });
});
