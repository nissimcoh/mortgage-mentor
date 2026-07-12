import { describe, expect, it } from "vitest";
import {
  annualizedMonthlyForwardsPercent,
  buildPrimeRatePathPercent,
  calculateScenarioSummary,
  calculateTrackSummary,
  solveMonthlyIrr,
  type PrimeTrackInput,
} from "../index";
// The bundled fallback IS the frozen June-2026 calendar row from the
// official BOI workbook — a single source of truth for the golden fixture.
import { createFallbackForecastCurve } from "../../market-data/mortgage-forecast-fallback";

const CURVE = createFallbackForecastCurve("2026-07-12T00:00:00Z");
const NOMINAL = CURVE.nominalZeroYieldsPercent;

/** The official golden benchmark (bank-published figures). */
const goldenTrack: PrimeTrackInput = {
  type: "prime",
  repaymentMethod: "spitzer",
  loanAmount: 500_000,
  years: 25,
  currentCustomerRatePercent: 4.5,
  currentBankOfIsraelRatePercent: 3.5,
  forecastZeroYieldsPercent: NOMINAL,
  forecastMode: "official",
  forecastCurveId: CURVE.id,
  forecastCurvePublicationDate: CURVE.publicationDate,
};

describe("annualized one-month forwards (June-2026 calendar goldens)", () => {
  it("matches the official curve fixture head", () => {
    expect(NOMINAL[0]).toBe(3.6269); // Z1
    expect(NOMINAL[1]).toBe(3.6054); // Z2
  });

  it("forward month 1 equals Z1", () => {
    const forwards = annualizedMonthlyForwardsPercent(NOMINAL);
    expect(forwards[0]).toBe(3.6269);
  });

  it("forward month 2 matches the documented golden value", () => {
    const forwards = annualizedMonthlyForwardsPercent(NOMINAL);
    expect(forwards[1]).toBeCloseTo(3.58390446, 6);
  });
});

describe("prime rate path", () => {
  const base = {
    months: 300,
    currentCustomerRatePercent: 4.5,
    currentBankOfIsraelRatePercent: 3.5,
    zeroYieldsPercent: NOMINAL,
  };

  it("keeps the customer margin over prime (P−0.5 on the benchmark)", () => {
    const path = buildPrimeRatePathPercent({
      ...base,
      forecastMode: "official",
    });
    // month 1: forward(1) + 1.5 + (4.5 − 5.0) = 3.6269 + 1.0
    expect(path[0]).toBeCloseTo(4.6269, 10);
  });

  it("shifting the entered rate by ±1pp shifts every month by exactly ±1pp", () => {
    const path = buildPrimeRatePathPercent({
      ...base,
      forecastMode: "official",
    });
    const up = buildPrimeRatePathPercent({
      ...base,
      currentCustomerRatePercent: 5.5,
      forecastMode: "official",
    });
    const down = buildPrimeRatePathPercent({
      ...base,
      currentCustomerRatePercent: 3.5,
      forecastMode: "official",
    });
    for (let index = 0; index < path.length; index++) {
      expect(up[index]).toBeCloseTo(path[index] + 1, 10);
      expect(down[index]).toBeCloseTo(path[index] - 1, 10);
    }
  });

  it("constant mode holds the entered rate for every month", () => {
    const path = buildPrimeRatePathPercent({
      ...base,
      forecastMode: "constant",
    });
    expect(path).toHaveLength(300);
    expect(path.every((rate) => rate === 4.5)).toBe(true);
  });

  it("stress mode applies a parallel shift to the official path", () => {
    const official = buildPrimeRatePathPercent({
      ...base,
      forecastMode: "official",
    });
    const stressed = buildPrimeRatePathPercent({
      ...base,
      forecastMode: "stress",
      stressShiftPercent: 2,
    });
    for (let index = 0; index < official.length; index++) {
      expect(stressed[index]).toBeCloseTo(official[index] + 2, 10);
    }
  });

  it("allows mathematically negative forecast rates (no 0% clamp)", () => {
    // No directive mandates a 0% floor, so negative scenarios flow through.
    const stressed = buildPrimeRatePathPercent({
      ...base,
      forecastMode: "stress",
      stressShiftPercent: -10,
    });
    expect(stressed[0]).toBeCloseTo(4.6269 - 10, 4);
    expect(stressed.every((rate) => rate < 0)).toBe(true);
  });

  it("a negative-rate stress scenario still amortizes to exactly 0", () => {
    const summary = calculateTrackSummary({
      ...goldenTrack,
      forecastMode: "stress",
      stressShiftPercent: -10,
    });
    expect(summary.finalBalance).toBe(0);
    expect(summary.numberOfPayments).toBe(300);
    // Negative rates mean the borrower repays less than the principal.
    expect(summary.forecast!.forecastTotalPayment).toBeLessThan(500_000);
    expect(summary.forecast!.forecastOverallRatePercent).toBeLessThan(0);
    expect(summary.schedule[0].activeAnnualRatePercent).toBeLessThan(0);
  });

  it("rejects scenarios beyond the mathematical validity bound", () => {
    expect(() =>
      buildPrimeRatePathPercent({
        ...base,
        forecastMode: "stress",
        stressShiftPercent: -2000,
      }),
    ).toThrow(/below the valid bound/);
  });

  it("rejects a curve shorter than the loan", () => {
    expect(() =>
      buildPrimeRatePathPercent({
        ...base,
        zeroYieldsPercent: NOMINAL.slice(0, 100),
      }),
    ).toThrow(/covers 100 months/);
  });
});

describe("golden calibration: 500k, 25y, prime Spitzer, June-2026 calendar", () => {
  const summary = calculateTrackSummary(goldenTrack);
  const forecast = summary.forecast!;

  it("current first payment (at the offered 4.5%) is exactly 2779.16", () => {
    expect(forecast.currentFirstPayment).toBe(2779.16);
  });

  it("forecast first and second payments match the benchmark", () => {
    expect(forecast.forecastFirstPayment).toBeCloseTo(2815.3, 2);
    expect(summary.schedule[1].payment).toBeCloseTo(2803.06, 2);
  });

  it("forecast maximum payment matches the benchmark", () => {
    expect(forecast.forecastMaximumPayment).toBeCloseTo(3048.27, 2);
    // The rounded maximum forms a plateau late in the loan; assert it lands
    // there rather than pinning one specific month.
    expect(forecast.monthOfForecastMaximumPayment).toBeGreaterThan(200);
    expect(forecast.monthOfForecastMaximumPayment).toBeLessThanOrEqual(300);
  });

  it("forecast total payments match within 1 ILS", () => {
    // Documented tolerance: the public workbook exposes 4 decimals per
    // yield, banks may carry more internally (benchmark: 886,380.21).
    expect(Math.abs(forecast.forecastTotalPayment - 886_380.21)).toBeLessThan(1);
  });

  it("forecast overall interest rate is ~5.09%", () => {
    expect(forecast.forecastOverallRatePercent).toBeCloseTo(5.09, 2);
  });

  it("runs 300 payments and ends at exactly 0", () => {
    expect(summary.numberOfPayments).toBe(300);
    expect(summary.finalBalance).toBe(0);
  });

  it("exposes margin, prime rate, and curve provenance", () => {
    expect(forecast.customerPrimeMarginPercent).toBeCloseTo(-0.5, 10);
    expect(forecast.currentPrimeRatePercent).toBe(5);
    expect(forecast.forecastCurveId).toBe("2026-06-calendar");
    expect(forecast.forecastCurvePublicationDate).toBe("2026-07-02");
  });

  it("schedule rows carry the active annual forecast rate", () => {
    expect(summary.schedule[0].activeAnnualRatePercent).toBeCloseTo(4.6269, 4);
    expect(
      summary.schedule.every(
        (entry) => entry.activeAnnualRatePercent !== undefined,
      ),
    ).toBe(true);
  });
});

describe("prime equal principal", () => {
  const summary = calculateTrackSummary({
    ...goldenTrack,
    repaymentMethod: "equalPrincipal",
  });

  it("repays a constant principal and ends at exactly 0", () => {
    const regular = 500_000 / 300;
    for (const entry of summary.schedule.slice(0, -1)) {
      expect(entry.principalPayment).toBeCloseTo(regular, 2);
    }
    expect(summary.finalBalance).toBe(0);
  });

  it("interest follows the forecast rate of each month", () => {
    // Month 1 interest = 500,000 × 4.6269%/12 = 1,927.875 → rounds to 1,927.88
    expect(summary.schedule[0].interestPayment).toBeCloseTo(1927.88, 2);
  });
});

describe("prime in scenarios and modes", () => {
  it("constant mode reproduces the ordinary fixed calculation", () => {
    const constant = calculateTrackSummary({
      ...goldenTrack,
      forecastMode: "constant",
    });
    expect(constant.forecast!.forecastFirstPayment).toBe(2779.16);
    expect(constant.forecast!.forecastMaximumPayment).toBe(2779.16);
  });

  it("mixes prime and fixedUnlinked tracks in one scenario", () => {
    const scenario = calculateScenarioSummary({
      tracks: [
        goldenTrack,
        {
          type: "fixedUnlinked",
          repaymentMethod: "spitzer",
          loanAmount: 300_000,
          annualInterestRatePercent: 4.8,
          interestRateInputMode: "nominalAnnual",
          years: 10,
        },
      ],
    });
    const [prime, fixed] = scenario.trackSummaries;
    expect(scenario.monthlyPayment).toBeCloseTo(
      prime.firstPayment + fixed.firstPayment,
      1,
    );
    expect(scenario.numberOfPayments).toBe(300);
    expect(scenario.finalBalance).toBe(0);
    // Combined payment drops after the 10-year fixed track ends.
    expect(scenario.combinedSchedule[120].payment).toBeLessThan(
      scenario.combinedSchedule[119].payment,
    );
  });
});

describe("IRR solver", () => {
  it("recovers the rate of a plain annuity", () => {
    // 100,000 at 0.5%/month for 120 months
    const i = 0.005;
    const payment = (100_000 * i) / (1 - Math.pow(1 + i, -120));
    const irr = solveMonthlyIrr(
      100_000,
      Array.from({ length: 120 }, () => payment),
    );
    expect(irr).toBeCloseTo(0.005, 8);
  });
});
