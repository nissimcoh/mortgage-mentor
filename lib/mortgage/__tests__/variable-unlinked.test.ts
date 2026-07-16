import { describe, expect, it } from "vitest";
import {
  annualizedBlockForwardPercent,
  buildVariableRateEqualPrincipalSchedule,
  buildVariableUnlinkedRatePathPercent,
  calculateScenarioSummary,
  calculateTrackSummary,
  variableAnchorMarginPercent,
  type VariableGovernmentBondTrackInput,
} from "../index";
import { createFallbackForecastCurve } from "../../market-data/mortgage-forecast-fallback";

const OFFICIAL_CURVE = createFallbackForecastCurve(
  "2026-07-14T00:00:00Z",
).nominalZeroYieldsPercent;

// Synthetic curve where every block rate can be verified by hand:
// A_m (percent) = 3 + m/120, so A_12 = 3.1, A_24 = 3.2, A_36 = 3.3, ...
const SYNTHETIC = Array.from({ length: 360 }, (_, i) => 3 + (i + 1) / 120);

const baseTrack: VariableGovernmentBondTrackInput = {
  type: "variableGovernmentBond",
  repaymentMethod: "spitzer",
  loanAmount: 600_000,
  years: 20,
  currentCustomerRatePercent: 4.5,
  resetPeriodMonths: 24,
  forecastZeroYieldsPercent: SYNTHETIC,
  forecastMode: "official",
  forecastCurveId: "synthetic",
  forecastCurvePublicationDate: "2026-07-01",
};

// Hand-computed values from the synthetic curve (annual-block variant used
// by the pure-path tests below; V=12 exercises the generic math).
const MARGIN_12 = 4.5 - 3.1; // offered − A_12 = 1.4
const FORWARD_12_24 = ((1.032 ** 2 / 1.031) ** 1 - 1) * 100;
const FORWARD_24_36 = ((1.033 ** 3 / 1.032 ** 2) ** 1 - 1) * 100;
// 24-month product: margin over A_24 and the 24→48 block forward.
const MARGIN_24 = 4.5 - 3.2; // offered − A_24 = 1.3
const FORWARD_24_48 =
  ((1.034 ** 4 / 1.032 ** 2) ** (12 / 24) - 1) * 100;

describe("block-forward rate path (synthetic curve, generic math)", () => {
  const path = buildVariableUnlinkedRatePathPercent({
    months: 240,
    currentCustomerRatePercent: 4.5,
    resetPeriodMonths: 12,
    zeroYieldsPercent: SYNTHETIC,
    forecastMode: "official",
  });

  it("documents the A_V anchor baseline for the margin", () => {
    expect(variableAnchorMarginPercent(4.5, SYNTHETIC, 12)).toBeCloseTo(
      MARGIN_12,
      10,
    );
  });

  it("uses the offered rate for months 1 through V", () => {
    for (let month = 1; month <= 12; month++) {
      expect(path[month - 1]).toBe(4.5);
    }
  });

  it("first reset occurs at month V+1", () => {
    expect(path[12]).not.toBe(path[11]);
  });

  it("block 2 equals the hand-computed forward(V,2V) + margin", () => {
    expect(annualizedBlockForwardPercent(SYNTHETIC, 12, 24)).toBeCloseTo(
      FORWARD_12_24,
      10,
    );
    expect(path[12]).toBeCloseTo(FORWARD_12_24 + MARGIN_12, 10);
  });

  it("keeps the rate constant across the complete second block", () => {
    for (let month = 13; month <= 24; month++) {
      expect(path[month - 1]).toBe(path[12]);
    }
  });

  it("later blocks use their own hand-computed forwards", () => {
    expect(path[24]).toBeCloseTo(FORWARD_24_36 + MARGIN_12, 10);
  });

  it("a partial final block keeps its block rate for the remaining months", () => {
    const short = buildVariableUnlinkedRatePathPercent({
      months: 30, // ends mid-block 3
      currentCustomerRatePercent: 4.5,
      resetPeriodMonths: 12,
      zeroYieldsPercent: SYNTHETIC,
      forecastMode: "official",
    });
    expect(short).toHaveLength(30);
    for (let month = 25; month <= 30; month++) {
      expect(short[month - 1]).toBeCloseTo(FORWARD_24_36 + MARGIN_12, 10);
    }
  });

  it("fails clearly when a required maturity is beyond the curve", () => {
    expect(() =>
      buildVariableUnlinkedRatePathPercent({
        months: 24,
        currentCustomerRatePercent: 4.5,
        resetPeriodMonths: 12,
        zeroYieldsPercent: SYNTHETIC.slice(0, 20),
        forecastMode: "official",
      }),
    ).toThrow(/no yield at maturity 24/);
  });
});

describe("government-bond forecast modes", () => {
  const base = {
    months: 96,
    currentCustomerRatePercent: 4.5,
    resetPeriodMonths: 24,
    zeroYieldsPercent: SYNTHETIC,
  };

  it("constant mode holds the offered rate with no resets", () => {
    const path = buildVariableUnlinkedRatePathPercent({
      ...base,
      forecastMode: "constant",
    });
    expect(path.every((rate) => rate === 4.5)).toBe(true);
  });

  it("stress shifts only the forecast blocks, not the initial offered period", () => {
    const stressed = buildVariableUnlinkedRatePathPercent({
      ...base,
      forecastMode: "stress",
      stressShiftPercent: 1,
    });
    for (let month = 1; month <= 24; month++) {
      expect(stressed[month - 1]).toBe(4.5); // contractual initial rate
    }
    expect(stressed[24]).toBeCloseTo(FORWARD_24_48 + MARGIN_24 + 1, 10);
  });

  it("negative stress may produce negative forecast rates without clamping", () => {
    const stressed = buildVariableUnlinkedRatePathPercent({
      ...base,
      forecastMode: "stress",
      stressShiftPercent: -10,
    });
    expect(stressed[24]).toBeCloseTo(FORWARD_24_48 + MARGIN_24 - 10, 10);
    expect(stressed[24]).toBeLessThan(0);
  });
});

describe("government-bond track summaries (24-month product)", () => {
  const summary = calculateTrackSummary(baseTrack);

  it("reprices the Spitzer payment only at 24-month reset boundaries", () => {
    const payments = summary.schedule.map((entry) => entry.payment);
    expect(new Set(payments.slice(0, 24)).size).toBe(1);
    expect(new Set(payments.slice(24, 48)).size).toBe(1);
    expect(payments[24]).not.toBe(payments[23]);
    expect(payments[48]).not.toBe(payments[47]);
  });

  it("block 2 rate equals forward(24,48) + margin over A_24", () => {
    expect(summary.schedule[24].activeAnnualRatePercent).toBeCloseTo(
      FORWARD_24_48 + MARGIN_24,
      10,
    );
    expect(summary.variableForecast!.customerAnchorMarginPercent).toBeCloseTo(
      MARGIN_24,
      10,
    );
  });

  it("first payment uses the offered rate; rows carry opening balances", () => {
    expect(summary.schedule[0].activeAnnualRatePercent).toBe(4.5);
    expect(summary.schedule[0].openingBalance).toBe(600_000);
    expect(summary.variableForecast!.currentFirstPayment).toBe(
      summary.firstPayment,
    );
  });

  it("amortizes to exactly zero with a sane IRR", () => {
    expect(summary.finalBalance).toBe(0);
    expect(summary.numberOfPayments).toBe(240);
    expect(
      summary.variableForecast!.forecastOverallRatePercent,
    ).toBeGreaterThan(0);
    expect(summary.variableForecast!.resetPeriodMonths).toBe(24);
  });

  it("supports catalog half-year terms (7.5y on the 30-month product)", () => {
    const halfYear = calculateTrackSummary({
      ...baseTrack,
      resetPeriodMonths: 30,
      years: 7.5,
    });
    expect(halfYear.numberOfPayments).toBe(90);
    expect(halfYear.finalBalance).toBe(0);
    // Reset boundary at month 31 (after the 30-month initial block).
    expect(halfYear.schedule[30].activeAnnualRatePercent).not.toBe(
      halfYear.schedule[29].activeAnnualRatePercent,
    );
  });

  it("rejects non-catalog reset periods and non-integral month counts", () => {
    expect(() =>
      calculateTrackSummary({
        ...baseTrack,
        resetPeriodMonths: 12,
      } as unknown as VariableGovernmentBondTrackInput),
    ).toThrow(/not a government-bond product option/);
    expect(() =>
      calculateTrackSummary({ ...baseTrack, years: 7.3 }),
    ).toThrow(/whole number of months/);
  });
});

describe("equal-principal engine capability remains intact", () => {
  it("the variable-rate equal-principal builder still works", () => {
    // Product presets are Spitzer-only, but the engine keeps EP capability
    // for future products; exercise the builder directly.
    const path = Array.from({ length: 120 }, (_, i) => (i < 60 ? 4 : 5));
    const schedule = buildVariableRateEqualPrincipalSchedule({
      loanAmount: 120_000,
      annualRatePercentPath: path,
      numberOfPayments: 120,
    });
    expect(schedule[schedule.length - 1].remainingBalance).toBe(0);
    for (const entry of schedule.slice(0, -1)) {
      expect(entry.principalPayment).toBeCloseTo(1000, 2);
    }
    expect(schedule[60].activeAnnualRatePercent).toBe(5);
  });
});

describe("government-bond in combined scenarios (official curve)", () => {
  const scenario = calculateScenarioSummary({
    tracks: [
      {
        type: "prime",
        repaymentMethod: "spitzer",
        loanAmount: 500_000,
        years: 25,
        currentCustomerRatePercent: 4.5,
        currentBankOfIsraelRatePercent: 3.5,
        forecastZeroYieldsPercent: OFFICIAL_CURVE,
        forecastMode: "official",
      },
      {
        type: "fixedUnlinked",
        repaymentMethod: "spitzer",
        loanAmount: 300_000,
        annualInterestRatePercent: 4.8,
        interestRateInputMode: "nominalAnnual",
        years: 10,
      },
      {
        type: "variableGovernmentBond",
        repaymentMethod: "spitzer",
        loanAmount: 200_000,
        years: 15,
        currentCustomerRatePercent: 4.0,
        resetPeriodMonths: 60,
        forecastZeroYieldsPercent: OFFICIAL_CURVE,
        forecastMode: "official",
      },
    ],
  });

  it("combines totals and ends at exactly zero", () => {
    const [prime, fixed, variable] = scenario.trackSummaries;
    expect(scenario.totalPayment).toBeCloseTo(
      prime.totalPayment + fixed.totalPayment + variable.totalPayment,
      2,
    );
    expect(scenario.finalBalance).toBe(0);
    expect(scenario.numberOfPayments).toBe(300);
  });

  it("weights the combined month-1 rate by opening balances", () => {
    // Prime month 1: 4.6269 (golden); fixed: 4.8; gov-bond: offered 4.0.
    expect(scenario.combinedSchedule[0].activeAnnualRatePercent).toBeCloseTo(
      (500_000 * 4.6269 + 300_000 * 4.8 + 200_000 * 4.0) / 1_000_000,
      6,
    );
  });

  it("sums the current-rate first payments (prime golden preserved)", () => {
    const [, fixed, variable] = scenario.trackSummaries;
    expect(scenario.currentCombinedFirstPayment).toBeCloseTo(
      2779.16 + fixed.firstPayment + variable.firstPayment,
      2,
    );
    expect(scenario.forecastOverallRatePercent).toBeGreaterThan(0);
  });
});
