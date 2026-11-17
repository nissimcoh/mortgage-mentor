import { describe, expect, it } from "vitest";
import { compareRefinance } from "../refinance";
import type { ExistingMortgageSimulation } from "../simulate";

/** A current mortgage paying 1,000 a month for 10 months. */
function simulation(payment = 1000, months = 10): ExistingMortgageSimulation {
  const combinedSchedule = Array.from({ length: months }, (_, index) => ({
    month: index + 1,
    payment,
    principalPayment: payment,
    interestPayment: 0,
    remainingBalance: payment * (months - index - 1),
  }));
  return {
    mode: "official",
    curveId: null,
    tracks: [],
    skipped: [],
    months: [],
    combinedSchedule,
    totals: {
      startBalance: payment * months,
      totalPayment: payment * months,
      totalCost: 0,
      firstMonthPayment: payment,
      maximumPayment: payment,
      maximumMonth: "2026-10",
      lastMonth: "2027-07",
    },
  };
}

const mix = { firstPayment: 900, highestPayment: 900, forecastTotalPaid: 9000, totalPrincipal: 10000, years: 10 / 12 };

describe("compareRefinance", () => {
  it("adds the early-repayment fees to the new mix", () => {
    const result = compareRefinance(simulation(), 10000, 300, mix);
    expect(result.mixTotalWithFees).toBe(9300);
    expect(result.difference).toBe(700); // 10,000 now vs 9,300 refinanced
    expect(result.mix.months).toBe(10);
    expect(result.breakEvenMonth).toBeNull(); // no payment series given
  });

  it("finds when the fees have paid for themselves", () => {
    // Saving 100 a month against 300 of fees: even after month 3.
    const result = compareRefinance(simulation(), 10000, 300, mix, Array(10).fill(900));
    expect(result.breakEvenMonth).toBe(3);
  });

  it("reports no break-even when refinancing never catches up", () => {
    const pricier = { ...mix, forecastTotalPaid: 11000 };
    const result = compareRefinance(simulation(), 10000, 300, pricier, Array(10).fill(1100));
    expect(result.difference).toBe(-1300);
    expect(result.breakEvenMonth).toBeNull();
  });

  it("flags a mix that does not borrow what refinancing needs", () => {
    expect(compareRefinance(simulation(), 10000, 0, mix).principalMatches).toBe(true);
    expect(compareRefinance(simulation(), 10150, 0, mix).principalMatches).toBe(true); // within 2%
    const short = compareRefinance(simulation(), 12000, 0, mix);
    expect(short.principalMatches).toBe(false);
    expect(short.principalGap).toBe(-2000);
  });
});
