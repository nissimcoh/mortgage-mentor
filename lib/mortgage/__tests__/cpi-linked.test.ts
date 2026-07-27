import { describe, expect, it } from "vitest";
import {
  buildCpiIndexFactors,
  calculateScenarioSummary,
  calculateTrackSummary,
  stabilityColorState,
  stabilityKeyForTrackType,
  trackStabilityScore,
  type FixedCpiLinkedTrackInput,
} from "../index";
import { createFallbackForecastCurve } from "../../market-data/mortgage-forecast-fallback";
import { parseCpiIndexRow } from "../../market-data/sources/boi-mortgage-forecast-parse";

const FALLBACK = createFallbackForecastCurve("2026-07-18T00:00:00Z");

// Synthetic index: constant 2%/year inflation, hand-computable everywhere.
// I[m] = 100 · 1.02^(m/12), so every monthly factor is 1.02^(1/12).
const FLAT_2PCT = Array.from({ length: 361 }, (_, m) =>
  100 * Math.pow(1.02, m / 12),
);
const MONTHLY_2PCT = Math.pow(1.02, 1 / 12);

const baseTrack: FixedCpiLinkedTrackInput = {
  type: "fixedLinked",
  repaymentMethod: "spitzer",
  loanAmount: 500_000,
  years: 20,
  currentCustomerRatePercent: 4.5,
  expectedCpiIndexPath: FLAT_2PCT,
  forecastMode: "official",
  forecastCurveId: "synthetic",
  forecastCurvePublicationDate: "2026-07-01",
};

describe("CPI index factors (pure path builder)", () => {
  it("derives monthly factors from the index path, month 1 = I[1]/I[0]", () => {
    const factors = buildCpiIndexFactors({
      months: 240,
      expectedCpiIndexPath: FLAT_2PCT,
      forecastMode: "official",
    });
    expect(factors).toHaveLength(240);
    expect(factors[0]).toBeCloseTo(FLAT_2PCT[1] / FLAT_2PCT[0], 12);
    for (const factor of factors) {
      expect(factor).toBeCloseTo(MONTHLY_2PCT, 12);
    }
  });

  it("cumulative product reproduces the index path", () => {
    const factors = buildCpiIndexFactors({
      months: 120,
      expectedCpiIndexPath: FLAT_2PCT,
      forecastMode: "official",
    });
    const cumulative = factors.reduce((product, f) => product * f, 1);
    expect(cumulative).toBeCloseTo(FLAT_2PCT[120] / FLAT_2PCT[0], 10);
  });

  it("constant mode yields all-1 factors", () => {
    const factors = buildCpiIndexFactors({
      months: 60,
      expectedCpiIndexPath: FLAT_2PCT,
      forecastMode: "constant",
    });
    expect(factors.every((factor) => factor === 1)).toBe(true);
  });

  it("stress multiplies by (1+shift)^(1/12); deflationary shifts allowed", () => {
    const official = buildCpiIndexFactors({
      months: 12,
      expectedCpiIndexPath: FLAT_2PCT,
      forecastMode: "official",
    });
    const up = buildCpiIndexFactors({
      months: 12,
      expectedCpiIndexPath: FLAT_2PCT,
      forecastMode: "stress",
      inflationStressShiftPercent: 1,
    });
    const down = buildCpiIndexFactors({
      months: 12,
      expectedCpiIndexPath: FLAT_2PCT,
      forecastMode: "stress",
      inflationStressShiftPercent: -5, // net deflation, not clamped
    });
    expect(up[0]).toBeCloseTo(official[0] * Math.pow(1.01, 1 / 12), 12);
    expect(down[0]).toBeCloseTo(official[0] * Math.pow(0.95, 1 / 12), 12);
    expect(down[0]).toBeLessThan(1);
  });

  it("rejects invalid stress and short/invalid paths clearly", () => {
    expect(() =>
      buildCpiIndexFactors({
        months: 12,
        expectedCpiIndexPath: FLAT_2PCT,
        forecastMode: "stress",
        inflationStressShiftPercent: -100,
      }),
    ).toThrow(/invalid/);
    expect(() =>
      buildCpiIndexFactors({
        months: 120,
        expectedCpiIndexPath: FLAT_2PCT.slice(0, 61),
        forecastMode: "official",
      }),
    ).toThrow(/covers 60 months/);
    const withHole = [...FLAT_2PCT];
    withHole[5] = Number.NaN;
    expect(() =>
      buildCpiIndexFactors({
        months: 12,
        expectedCpiIndexPath: withHole,
        forecastMode: "official",
      }),
    ).toThrow(/invalid value around month/);
  });
});

describe("fixed CPI-linked Spitzer schedule", () => {
  const summary = calculateTrackSummary(baseTrack);
  const cpi = summary.cpiForecast!;

  it("no-inflation mode matches fixedUnlinked exactly, except metadata", () => {
    const constant = calculateTrackSummary({
      ...baseTrack,
      forecastMode: "constant",
    });
    const unlinked = calculateTrackSummary({
      type: "fixedUnlinked",
      repaymentMethod: "spitzer",
      loanAmount: 500_000,
      annualInterestRatePercent: 4.5,
      interestRateInputMode: "nominalAnnual",
      years: 20,
    });
    expect(constant.monthlyPayment).toBe(unlinked.monthlyPayment);
    expect(constant.totalPayment).toBe(unlinked.totalPayment);
    expect(constant.totalInterest).toBe(unlinked.totalInterest);
    expect(constant.finalBalance).toBe(0);
    for (let index = 0; index < constant.schedule.length; index++) {
      expect(constant.schedule[index].payment).toBe(
        unlinked.schedule[index].payment,
      );
      expect(constant.schedule[index].remainingBalance).toBe(
        unlinked.schedule[index].remainingBalance,
      );
      expect(constant.schedule[index].indexationAmount).toBe(0);
    }
    // Constant-mode first payment equals the visible current first payment.
    expect(constant.cpiForecast!.forecastFirstPayment).toBe(
      constant.cpiForecast!.currentFirstPayment,
    );
    expect(constant.cpiForecast!.firstYearExpectedInflationPercent).toBe(0);
  });

  it("shows the base current payment; forecast payments rise with inflation", () => {
    // Visible first payment = plain Spitzer at the offered linked rate.
    expect(summary.monthlyPayment).toBe(cpi.currentFirstPayment);
    // Forecast month 1 carries one month of expected indexation.
    expect(cpi.forecastFirstPayment).toBeCloseTo(
      cpi.currentFirstPayment * MONTHLY_2PCT,
      1,
    );
    // Nominal payments increase monotonically under positive inflation.
    for (let index = 1; index < summary.schedule.length - 1; index++) {
      expect(summary.schedule[index].payment).toBeGreaterThan(
        summary.schedule[index - 1].payment,
      );
    }
    expect(cpi.forecastMaximumPayment).toBeGreaterThan(cpi.currentFirstPayment);
  });

  it("follows the mandated order of operations with correct indexation", () => {
    const first = summary.schedule[0];
    expect(first.openingBalance).toBe(500_000);
    expect(first.indexationAmount).toBeCloseTo(
      500_000 * (MONTHLY_2PCT - 1),
      2,
    );
    const monthlyRate = 4.5 / 100 / 12;
    expect(first.interestPayment).toBeCloseTo(
      500_000 * MONTHLY_2PCT * monthlyRate,
      2,
    );
    // Row identity: payment = principal + interest; remaining = indexed − principal.
    for (const entry of summary.schedule) {
      expect(entry.payment).toBeCloseTo(
        entry.principalPayment + entry.interestPayment,
        1,
      );
      expect(entry.remainingBalance).toBeCloseTo(
        entry.openingBalance! + entry.indexationAmount! - entry.principalPayment,
        1,
      );
      expect(entry.activeAnnualRatePercent).toBe(4.5);
    }
  });

  it("ends at exactly zero with the max payment at the last month", () => {
    expect(summary.finalBalance).toBe(0);
    expect(summary.numberOfPayments).toBe(240);
    // Under steady positive inflation the maximum is (near) the last month.
    expect(cpi.monthOfForecastMaximumPayment).toBeGreaterThan(230);
  });

  it("deflation decreases nominal payments and still ends at zero", () => {
    const deflation = Array.from({ length: 361 }, (_, m) =>
      100 * Math.pow(0.99, m / 12),
    );
    const shrinking = calculateTrackSummary({
      ...baseTrack,
      expectedCpiIndexPath: deflation,
    });
    expect(shrinking.schedule[100].payment).toBeLessThan(
      shrinking.schedule[0].payment,
    );
    expect(shrinking.finalBalance).toBe(0);
    expect(shrinking.cpiForecast!.forecastTotalPayment).toBeLessThan(
      summary.cpiForecast!.forecastTotalPayment,
    );
  });

  it("IRR exceeds the offered linked rate under positive inflation", () => {
    expect(cpi.forecastOverallRatePercent).toBeGreaterThan(4.5);
    const constant = calculateTrackSummary({
      ...baseTrack,
      forecastMode: "constant",
    });
    expect(constant.cpiForecast!.forecastOverallRatePercent).toBeCloseTo(
      4.59,
      1, // nominal 4.5%/12 compounded ≈ 4.594% effective
    );
  });

  it("computes first-year expected inflation from the index path", () => {
    expect(cpi.firstYearExpectedInflationPercent).toBeCloseTo(2, 6);
    const official = calculateTrackSummary({
      ...baseTrack,
      expectedCpiIndexPath: FALLBACK.expectedCpiIndex,
    });
    expect(
      official.cpiForecast!.firstYearExpectedInflationPercent,
    ).toBeCloseTo(
      (FALLBACK.expectedCpiIndex[12] / FALLBACK.expectedCpiIndex[0] - 1) * 100,
      10,
    );
    expect(official.finalBalance).toBe(0);
  });
});

describe("fixed CPI-linked in combined scenarios and stability", () => {
  it("combines with fixedUnlinked and prime; weighted rate includes it", () => {
    const scenario = calculateScenarioSummary({
      tracks: [
        {
          type: "fixedUnlinked",
          repaymentMethod: "spitzer",
          loanAmount: 300_000,
          annualInterestRatePercent: 4.8,
          interestRateInputMode: "nominalAnnual",
          years: 10,
        },
        {
          type: "prime",
          repaymentMethod: "spitzer",
          loanAmount: 500_000,
          years: 25,
          currentCustomerRatePercent: 4.5,
          currentBankOfIsraelRatePercent: 3.5,
          forecastZeroYieldsPercent: FALLBACK.nominalZeroYieldsPercent,
          forecastMode: "official",
        },
        { ...baseTrack, loanAmount: 200_000 },
      ],
    });
    expect(scenario.finalBalance).toBe(0);
    expect(scenario.numberOfPayments).toBe(300);
    // Month-1 weighted rate: (300k·4.8 + 500k·4.6269 + 200k·4.5) / 1M.
    expect(scenario.combinedSchedule[0].activeAnnualRatePercent).toBeCloseTo(
      (300_000 * 4.8 + 500_000 * 4.6269 + 200_000 * 4.5) / 1_000_000,
      6,
    );
    expect(scenario.monthOfMaximumPayment).toBeGreaterThanOrEqual(1);
    // Current combined first payment uses the CPI track's BASE payment.
    const cpiCurrent =
      scenario.trackSummaries[2].cpiForecast!.currentFirstPayment;
    expect(scenario.currentCombinedFirstPayment).toBeCloseTo(
      scenario.trackSummaries[0].firstPayment + 2779.16 + cpiCurrent,
      2,
    );
  });

  it("fixedLinked stability: 63/100, amber/moderate", () => {
    const score = trackStabilityScore(stabilityKeyForTrackType("fixedLinked"));
    expect(Math.round(score)).toBe(63);
    expect(stabilityColorState(score)).toBe("moderate");
  });
});

describe("expected-CPI-index sheet parsing", () => {
  const validCells = [
    2026,
    "יוני",
    "קלנדרי",
    ...Array.from({ length: 361 }, (_, m) => 100 * Math.pow(1.02, m / 12)),
  ];

  it("parses a valid 361-value row with base 100", () => {
    const row = parseCpiIndexRow(validCells);
    expect(row).not.toBeNull();
    expect(row!.referenceMonth).toBe(6);
    expect(row!.averageType).toBe("calendar");
    expect(row!.indexValues).toHaveLength(361);
    expect(row!.indexValues[0]).toBeCloseTo(100, 6);
  });

  it("rejects malformed rows clearly", () => {
    expect(parseCpiIndexRow(["שנה", "חודש", "סוג ממוצע"])).toBeNull();
    expect(parseCpiIndexRow(validCells.slice(0, 100))).toBeNull(); // short
    const wrongBase = [...validCells];
    wrongBase[3] = 90; // maturity-0 not ~100
    expect(parseCpiIndexRow(wrongBase)).toBeNull();
    const withGap = [...validCells];
    withGap[50] = null;
    expect(parseCpiIndexRow(withGap)).toBeNull();
  });

  it("fallback carries the index and is never labeled live", () => {
    expect(FALLBACK.expectedCpiIndex).toHaveLength(361);
    expect(FALLBACK.expectedCpiIndex[0]).toBeCloseTo(100, 6);
    expect(FALLBACK.status).toBe("fallback");
    expect(FALLBACK.status).not.toBe("live");
  });
});
