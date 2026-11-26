import { describe, expect, it } from "vitest";
import { combinePayoffFiles, feesAssumedZero, normalizeLoanNumber, trackFees, trackSettlement } from "../combine";
import { parsePayoffReportFile } from "../parse";
import type { PayoffReportFile } from "../types";
import { cloneRaw, fictionalTwoLoanFile } from "./fixtures";

function file(name: string, raw: unknown = fictionalTwoLoanFile()): PayoffReportFile {
  const result = parsePayoffReportFile(raw, name);
  if (!result.ok) throw new Error("fixture must parse");
  return result.file;
}

/** The fixture file split into one file per loan. */
function splitFiles(): PayoffReportFile[] {
  const whole = file("all.pdf");
  return whole.loans.map((loan, index) => ({ fileName: `loan-${index}.pdf`, loans: [loan] }));
}

describe("normalizeLoanNumber", () => {
  it("compares loan numbers by digits only", () => {
    expect(normalizeLoanNumber("11-1111111-01-11")).toBe("1111111110111");
    expect(normalizeLoanNumber(" - ")).toBeNull();
    expect(normalizeLoanNumber(null)).toBeNull();
  });
});

describe("combinePayoffFiles", () => {
  it("uses the full printed loan total when one active track amount is missing", () => {
    const files = splitFiles();
    const track = files[0].loans[0].tracks[0];
    track.balance.totalToSettle = null;
    track.fees.total = null;
    track.monthlyPayment = null;
    expect(combinePayoffFiles(files).totals).toEqual({
      activeTrackCount: 3, monthlyPayment: 2867.87, fees: 1662.72, totalToSettle: 284378.25,
    });
  });

  it("counts fees the report leaves out as 0 and settles a track from its printed parts", () => {
    const files = splitFiles();
    const loan = files[1].loans[0];
    const track = loan.tracks[0];
    const before = combinePayoffFiles(files).totals;
    track.balance.totalToSettle = null;
    track.fees = { ...track.fees, total: null, capitalization: null, notice: null, averageCpi: null, operational: null };
    loan.reportedTotals.totalToSettle = null;
    loan.reportedTotals.fees = null;
    expect(trackFees(track)).toBe(0);
    const { balance } = track;
    const parts = [balance.principal, balance.indexation, balance.accruedInterest, balance.futureMonthlyCharge, balance.arrears, balance.otherCharges]
      .reduce<number>((sum, value) => sum + (value ?? 0), 0);
    expect(trackSettlement(track)).toBeCloseTo(parts, 2);
    expect(feesAssumedZero(files.flatMap((file) => file.loans))).toBe(true);
    const totals = combinePayoffFiles(files).totals;
    expect(totals.fees).not.toBeNull();
    expect(totals.fees!).toBeLessThan(before.fees!);
    expect(totals.totalToSettle).not.toBeNull();
    // A bank total, when printed, still wins over the parts.
    loan.reportedTotals.fees = 0;
    expect(feesAssumedZero(files.flatMap((file) => file.loans))).toBe(false);
  });

  it("cannot settle a track without its principal", () => {
    const files = splitFiles();
    const loan = files[1].loans[0];
    loan.tracks[0].balance.totalToSettle = null;
    loan.tracks[0].balance.principal = null;
    loan.reportedTotals.totalToSettle = null;
    expect(trackSettlement(loan.tracks[0])).toBeNull();
    expect(combinePayoffFiles(files).totals.totalToSettle).toBeNull();
  });

  it("totals active tracks across files plus loan-level fees", () => {
    const combined = combinePayoffFiles(splitFiles());
    expect(combined.loans.map((loan) => loan.fileName)).toEqual(["loan-0.pdf", "loan-1.pdf"]);
    expect(combined.skipped).toEqual([]);
    expect(combined.asOfDates).toEqual(["2026-03-10"]);
    expect(combined.totals).toEqual({
      activeTrackCount: 3,
      monthlyPayment: 2867.87,
      fees: 1662.72,
      totalToSettle: 284378.25,
    });
    expect(combined.loans.every((loan) => loan.checks.length === 0)).toBe(true);
  });

  it("gives the same result for one file with two loans", () => {
    expect(combinePayoffFiles([file("all.pdf")]).totals).toEqual(
      combinePayoffFiles(splitFiles()).totals,
    );
  });

  it("does not count the same report twice", () => {
    const combined = combinePayoffFiles([file("a.pdf"), file("a-copy.pdf")]);
    expect(combined.loans).toHaveLength(2);
    expect(combined.totals.totalToSettle).toBe(284378.25);
    expect(combined.skipped.map((skip) => [skip.fileName, skip.reason])).toEqual([
      ["a-copy.pdf", "duplicate"],
      ["a-copy.pdf", "duplicate"],
    ]);
  });

  it("keeps the newest report of a loan whichever order they arrive in", () => {
    const newerRaw = cloneRaw(fictionalTwoLoanFile());
    newerRaw.loans = [newerRaw.loans[1]];
    newerRaw.loans[0].asOfDate = "2026-04-10";
    newerRaw.loans[0].loanNumber = "1122222220122"; // printed without dashes
    const older = file("march.pdf");
    const newer = file("april.pdf", newerRaw);

    for (const order of [
      [older, newer],
      [newer, older],
    ]) {
      const combined = combinePayoffFiles(order);
      const kept = combined.loans.find((loan) => loan.loan.loanNumber?.endsWith("122"));
      expect(kept?.fileName).toBe("april.pdf");
      expect(combined.skipped).toEqual([
        {
          fileName: "march.pdf",
          loanNumber: "11-2222222-01-22",
          reason: "olderReport",
          keptFileName: "april.pdf",
        },
      ]);
      expect(combined.asOfDates).toEqual(["2026-03-10", "2026-04-10"]);
    }
  });

  it("never merges loans without a number", () => {
    const raw = cloneRaw(fictionalTwoLoanFile()) as { loans: { loanNumber: unknown }[] };
    for (const loan of raw.loans) loan.loanNumber = null;
    const combined = combinePayoffFiles([file("a.pdf", raw), file("b.pdf", raw)]);
    expect(combined.loans).toHaveLength(4);
    expect(combined.skipped).toEqual([]);
  });
});
