import { describe, expect, it } from "vitest";
import {
  GOVERNMENT_BOND_RESET_MONTHS,
  GOVERNMENT_BOND_TERM_YEARS,
  isGovernmentBondTermValid,
  isMakamTermValid,
  MAKAM_TERM_YEARS,
  paymentMonthParts,
  termMonthsFromYears,
} from "../product-catalog";

describe("government-bond term catalog", () => {
  it("offers exactly the required reset frequencies", () => {
    expect([...GOVERNMENT_BOND_RESET_MONTHS]).toEqual([
      24, 30, 36, 60, 84, 120,
    ]);
  });

  it("lists the exact term options for every reset frequency", () => {
    expect([...GOVERNMENT_BOND_TERM_YEARS[24]]).toEqual([
      4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30,
    ]);
    expect([...GOVERNMENT_BOND_TERM_YEARS[30]]).toEqual([
      5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5, 30,
    ]);
    expect([...GOVERNMENT_BOND_TERM_YEARS[36]]).toEqual([
      6, 9, 12, 15, 18, 21, 24, 27, 30,
    ]);
    expect([...GOVERNMENT_BOND_TERM_YEARS[60]]).toEqual([10, 15, 20, 25, 30]);
    expect([...GOVERNMENT_BOND_TERM_YEARS[84]]).toEqual([14, 21, 28]);
    // 120-month product: exactly [20, 30] — 10 years is NOT offered.
    expect([...GOVERNMENT_BOND_TERM_YEARS[120]]).toEqual([20, 30]);
  });

  it("10 years is not a 120-month reset option", () => {
    expect(isGovernmentBondTermValid(120, 10)).toBe(false);
    expect(isGovernmentBondTermValid(120, 20)).toBe(true);
    expect(isGovernmentBondTermValid(120, 30)).toBe(true);
  });

  it("half-year values appear only for the 30-month reset product", () => {
    for (const reset of GOVERNMENT_BOND_RESET_MONTHS) {
      const hasHalves = GOVERNMENT_BOND_TERM_YEARS[reset].some(
        (years) => !Number.isInteger(years),
      );
      expect(hasHalves).toBe(reset === 30);
    }
    expect(MAKAM_TERM_YEARS.every(Number.isInteger)).toBe(true);
  });

  it("validates terms as exact catalog options", () => {
    expect(isGovernmentBondTermValid(30, 7.5)).toBe(true);
    expect(isGovernmentBondTermValid(24, 7.5)).toBe(false);
    expect(isGovernmentBondTermValid(84, 20)).toBe(false);
    expect(isMakamTermValid(4)).toBe(true);
    expect(isMakamTermValid(30)).toBe(true);
    expect(isMakamTermValid(3)).toBe(false);
    expect(isMakamTermValid(12.5)).toBe(false);
  });
});

describe("years → months conversion", () => {
  it("converts 7.5 years to exactly 90 payments", () => {
    expect(termMonthsFromYears(7.5)).toBe(90);
    expect(termMonthsFromYears(22.5)).toBe(270);
    expect(termMonthsFromYears(30)).toBe(360);
  });

  it("rejects a non-integral month count", () => {
    expect(() => termMonthsFromYears(7.3)).toThrow(/whole number of months/);
    expect(() => termMonthsFromYears(10.01)).toThrow(/whole number of months/);
  });
});

describe("payment-month formatter parts", () => {
  it("maps months to year/month-of-year exactly", () => {
    expect(paymentMonthParts(1)).toEqual({ month: 1, year: 1, monthOfYear: 1 });
    expect(paymentMonthParts(12)).toEqual({
      month: 12,
      year: 1,
      monthOfYear: 12,
    });
    expect(paymentMonthParts(13)).toEqual({
      month: 13,
      year: 2,
      monthOfYear: 1,
    });
    expect(paymentMonthParts(255)).toEqual({
      month: 255,
      year: 22,
      monthOfYear: 3,
    });
  });

  it("rejects invalid months", () => {
    expect(() => paymentMonthParts(0)).toThrow(/positive integer/);
    expect(() => paymentMonthParts(1.5)).toThrow(/positive integer/);
  });
});
