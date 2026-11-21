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
  it("keeps financed fees and their interest inside the saved payment forecast", () => {
    const result = compareRefinance(simulation(35000), 200000, 1662.72,
      { ...mix, totalPrincipal: 200000, forecastTotalPaid: 300000 });
    expect(result.financedFees).toBe(1662.72);
    expect(result.upfrontCosts).toBe(0);
    expect(result.mixTotalWithFees).toBe(300000);
    expect(result.difference).toBe(50000);
    expect(result.mix.months).toBe(10);
    expect(result.breakEvenMonth).toBeNull(); // no payment series given
  });

  it("finds when the fees have paid for themselves", () => {
    // Saving 100 a month against 300 of fees: even after month 3.
    const result = compareRefinance(simulation(), 10300, 300, mix, Array(10).fill(900));
    expect(result.mixTotalWithFees).toBe(9300);
    expect(result.financedFees).toBe(0);
    expect(result.cashFees).toBe(300);
    expect(result.breakEvenMonth).toBe(3);
  });

  it("reports no break-even when refinancing never catches up", () => {
    const pricier = { ...mix, forecastTotalPaid: 11000 };
    const result = compareRefinance(simulation(), 10300, 300, pricier, Array(10).fill(1100));
    expect(result.difference).toBe(-1300);
    expect(result.breakEvenMonth).toBeNull();
  });

  it("flags a mix that does not borrow what refinancing needs", () => {
    expect(compareRefinance(simulation(), 10000, 0, mix).principalMatches).toBe(true);
    expect(compareRefinance(simulation(), 10000.49, 0, mix).principalMatches).toBe(true);
    const short = compareRefinance(simulation(), 12000, 0, mix);
    expect(short.principalMatches).toBe(false);
    expect(short.principalGap).toBe(-2000);
  });

  it("adds only the cash part and other upfront expenses when fees are split", () => {
    const result = compareRefinance(simulation(), 10100, 1020, mix, Array(10).fill(900), 360);
    expect(result).toMatchObject({ financedFees: 920, cashFees: 100, upfrontCosts: 460,
      mixTotalWithFees: 9460, difference: 540, breakEvenMonth: 5, principalMatches: true });
  });

  it("allows rounding each financed track to whole shekels", () => {
    const result = compareRefinance(simulation(), 10001.35, 920, { ...mix, trackCount: 3 }, Array(10).fill(900));
    expect(result).toMatchObject({ cashFees: 0, upfrontCosts: 0, breakEvenMonth: null, principalMatches: true });
  });

  it("limits cash fees to the reported fees when a loan is underfunded", () => {
    const result = compareRefinance(simulation(), 11000, 300, mix, Array(10).fill(900));
    expect(result).toMatchObject({ cashFees: 300, principalGap: -700, principalMatches: false, breakEvenMonth: null });
  });
});
