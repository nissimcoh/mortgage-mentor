import { describe, expect, it } from "vitest";
import {
  checkPayoffLoan,
  impliedSpitzerPayment,
  remainingPaymentCounts,
} from "../checks";
import { parsePayoffReportFile } from "../parse";
import type { PayoffLoan } from "../types";
import { fictionalTwoLoanFile } from "./fixtures";

function loans(): PayoffLoan[] {
  const result = parsePayoffReportFile(fictionalTwoLoanFile(), "report.pdf");
  if (!result.ok) throw new Error("fixture must parse");
  return result.file.loans;
}

function codes(loan: PayoffLoan) {
  return checkPayoffLoan(loan).map((check) => [check.code, check.trackIndex]);
}

describe("remainingPaymentCounts", () => {
  it("counts from the next payment day through the end date", () => {
    expect(remainingPaymentCounts("2026-03-10", "2021-04-01", "2036-03-01")).toEqual([120]);
    expect(remainingPaymentCounts("2026-12-20", "2021-04-01", "2027-01-01")).toEqual([1]);
  });

  it("starts at the first payment when it is still ahead", () => {
    expect(remainingPaymentCounts("2026-03-10", "2026-05-01", "2026-07-01")).toEqual([3]);
  });

  it("allows both counts when the report date is a payment day", () => {
    expect(remainingPaymentCounts("2026-03-01", "2021-04-01", "2026-05-01")).toEqual([2, 3]);
  });

  it("returns nothing once the term is over", () => {
    expect(remainingPaymentCounts("2026-03-10", "2021-04-01", "2025-06-01")).toEqual([]);
  });
});

describe("impliedSpitzerPayment", () => {
  it("matches the closed-form annuity payment", () => {
    // 100,000 at 6% over 12 months: the textbook payment is 8,606.64.
    expect(impliedSpitzerPayment(100000, 6, 12)).toBeCloseTo(8606.64, 2);
  });

  it("divides evenly at a zero rate", () => {
    expect(impliedSpitzerPayment(1200, 0, 12)).toBe(100);
  });
});

describe("checkPayoffLoan", () => {
  it("passes a consistent report silently", () => {
    for (const loan of loans()) expect(checkPayoffLoan(loan)).toEqual([]);
  });

  it("catches a misread principal through the balance and payment identities", () => {
    const loan = loans()[0];
    loan.tracks[0].balance.principal = 105000; // a 1 read as a 0
    expect(codes(loan)).toEqual([
      ["trackBalanceSum", 0],
      ["noticeFeeRate", 0],
      ["spitzerPayment", 0],
    ]);
  });

  it("catches a misread rate through the payment identity", () => {
    const loan = loans()[0];
    loan.tracks[1].annualRatePercent = 3.8;
    const [check] = checkPayoffLoan(loan);
    expect(check).toMatchObject({ code: "spitzerPayment", trackIndex: 1, actual: 573.01 });
    expect(check.expected).toBeGreaterThan(573.01);
  });

  it("tolerates rounding to agorot and small CPI timing differences", () => {
    const loan = loans()[0];
    loan.tracks[0].balance.totalToSettle = 151527.74;
    loan.tracks[1].monthlyPayment = 574.5; // +0.26%
    loan.reportedTotals.monthlyPayment = 2150.86;
    expect(checkPayoffLoan(loan)).toEqual([]);
  });

  it("checks fee components against the fee total", () => {
    const loan = loans()[0];
    loan.tracks[0].fees.capitalization = 1100;
    expect(codes(loan)).toEqual([["trackFeeSum", 0]]);
  });

  it("checks track figures against the loan totals, counting loan-level fees", () => {
    const loan = loans()[0];
    loan.loanLevelFees = null;
    expect(codes(loan)).toEqual([
      ["loanFeesSum", null],
      ["loanTotalToSettleSum", null],
    ]);
    const other = loans()[0];
    other.reportedTotals.monthlyPayment = 2194.37;
    expect(codes(other)).toEqual([["loanMonthlyPaymentSum", null]]);
  });

  it("flags status contradictions", () => {
    const loan = loans()[0];
    loan.tracks[2].balance.totalToSettle = 1000;
    loan.tracks[0].endDate = "2026-01-01";
    loan.tracks[0].repaymentMethod = "unknown";
    expect(codes(loan)).toEqual([
      ["activeTrackPastEndDate", 0],
      ["closedTrackHasBalance", 2],
      ["loanTotalToSettleSum", null],
    ]);
  });

  it("notes a variable track whose reset details were not read", () => {
    const loan = loans()[0];
    loan.tracks[1].variable = null;
    const [check] = checkPayoffLoan(loan);
    expect(check).toMatchObject({
      code: "variableRateDetailsMissing",
      severity: "info",
      trackIndex: 1,
    });
  });

  it("skips checks whose figures are missing", () => {
    const loan = loans()[0];
    for (const track of loan.tracks) {
      track.monthlyPayment = null;
      track.balance.totalToSettle = null;
      track.fees.total = null;
    }
    loan.reportedTotals = { monthlyPayment: null, fees: null, totalToSettle: null };
    expect(checkPayoffLoan(loan)).toEqual([]);
  });
});
