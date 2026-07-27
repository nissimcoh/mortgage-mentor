import { describe, expect, it } from "vitest";
import {
  buildComparisonRows,
  costInsight,
  cpiLinkedExposurePercent,
  paymentShapeInsight,
  primeExposurePercent,
  principalSharePercent,
  scenarioStabilityScore,
  stabilityInsight,
  tryCalculateScenario,
  variableRateExposurePercent,
  type ScenarioForCompare,
} from "../scenario-compare";
import type { MortgageTrackInput } from "../types";

const CURVE_360 = Array.from({ length: 360 }, () => 4);

function fixedTrack(loanAmount: number): MortgageTrackInput {
  return {
    type: "fixedUnlinked",
    repaymentMethod: "spitzer",
    loanAmount,
    annualInterestRatePercent: 4.8,
    years: 20,
  };
}

function primeTrack(loanAmount: number): MortgageTrackInput {
  return {
    type: "prime",
    repaymentMethod: "spitzer",
    loanAmount,
    years: 20,
    currentCustomerRatePercent: 4.5,
    currentBankOfIsraelRatePercent: 3.5,
    forecastZeroYieldsPercent: CURVE_360,
    forecastMode: "constant",
  };
}

function govBondTrack(loanAmount: number): MortgageTrackInput {
  return {
    type: "variableGovernmentBond",
    repaymentMethod: "spitzer",
    loanAmount,
    years: 20,
    currentCustomerRatePercent: 4.2,
    resetPeriodMonths: 60,
    forecastZeroYieldsPercent: CURVE_360,
    forecastMode: "constant",
  };
}

function fixedLinkedTrack(loanAmount: number): MortgageTrackInput {
  return {
    type: "fixedLinked",
    repaymentMethod: "spitzer",
    loanAmount,
    years: 20,
    currentCustomerRatePercent: 3.5,
    expectedCpiIndexPath: Array.from({ length: 241 }, () => 100),
    forecastMode: "constant",
  };
}

describe("principalSharePercent", () => {
  it("computes the share matching the predicate by original principal", () => {
    const inputs = [fixedTrack(700_000), primeTrack(300_000)];
    expect(
      principalSharePercent(inputs, (i) => i.type === "prime"),
    ).toBeCloseTo(30, 6);
  });

  it("returns 0 for an empty or zero-principal input set", () => {
    expect(principalSharePercent([], () => true)).toBe(0);
  });
});

describe("exposure metrics", () => {
  it("computes prime, CPI-linked, and variable-rate exposure for a mixed scenario", () => {
    const inputs = [
      fixedTrack(500_000),
      primeTrack(300_000),
      fixedLinkedTrack(200_000),
    ];
    expect(primeExposurePercent(inputs)).toBeCloseTo(30, 6);
    expect(cpiLinkedExposurePercent(inputs)).toBeCloseTo(20, 6);
    // Only prime is rate-variable here; fixedLinked must NOT count.
    expect(variableRateExposurePercent(inputs)).toBeCloseTo(30, 6);
  });

  it("counts government-bond and Makam tracks toward variable-rate exposure", () => {
    const inputs = [fixedTrack(400_000), govBondTrack(600_000)];
    expect(primeExposurePercent(inputs)).toBe(0);
    expect(variableRateExposurePercent(inputs)).toBeCloseTo(60, 6);
  });

  it("excludes fixedLinked from variable-rate exposure even when it's the whole scenario", () => {
    const inputs = [fixedLinkedTrack(500_000)];
    expect(variableRateExposurePercent(inputs)).toBe(0);
    expect(cpiLinkedExposurePercent(inputs)).toBe(100);
  });

  it("includes prime in variable-rate exposure alongside its own prime-exposure line", () => {
    const inputs = [primeTrack(500_000)];
    expect(primeExposurePercent(inputs)).toBe(100);
    expect(variableRateExposurePercent(inputs)).toBe(100);
  });
});

describe("buildComparisonRows", () => {
  function scenario(name: string, inputs: MortgageTrackInput[]): ScenarioForCompare {
    const summary = tryCalculateScenario(inputs);
    if (!summary) throw new Error("expected a valid summary in test setup");
    return { name, inputs, summary };
  }

  it("produces a diff (B - A) for every metric, in a stable order", () => {
    const a = scenario("A", [fixedTrack(500_000)]);
    const b = scenario("B", [fixedTrack(500_000), primeTrack(200_000)]);
    const rows = buildComparisonRows(a, b);

    expect(rows.map((r) => r.metric)).toEqual([
      "firstPayment",
      "maxPayment",
      "totalPayment",
      "totalInterest",
      "stabilityScore",
      "trackCount",
      "primeExposure",
      "cpiExposure",
      "variableExposure",
    ]);

    const trackCountRow = rows.find((r) => r.metric === "trackCount")!;
    expect(trackCountRow.valueA).toBe(1);
    expect(trackCountRow.valueB).toBe(2);
    expect(trackCountRow.diff).toBe(1);

    const primeRow = rows.find((r) => r.metric === "primeExposure")!;
    expect(primeRow.valueA).toBe(0);
    expect(primeRow.diff).toBeGreaterThan(0);
  });

  it("computes totalPayment diff consistent with a hand-checked cheaper scenario", () => {
    const cheaper = scenario("Cheaper", [fixedTrack(400_000)]);
    const pricier = scenario("Pricier", [fixedTrack(600_000)]);
    const rows = buildComparisonRows(cheaper, pricier);
    const totalPaymentRow = rows.find((r) => r.metric === "totalPayment")!;
    expect(totalPaymentRow.diff).toBeGreaterThan(0); // B (pricier) costs more
    expect(totalPaymentRow.valueB).toBeGreaterThan(totalPaymentRow.valueA);
  });
});

describe("scenarioStabilityScore", () => {
  it("is higher for an all-fixed scenario than an all-prime one", () => {
    const fixedScore = scenarioStabilityScore([fixedTrack(500_000)]);
    const primeScore = scenarioStabilityScore([primeTrack(500_000)]);
    expect(fixedScore).toBeGreaterThan(primeScore);
  });
});

describe("insight generators", () => {
  function scenario(name: string, inputs: MortgageTrackInput[]): ScenarioForCompare {
    const summary = tryCalculateScenario(inputs);
    if (!summary) throw new Error("expected a valid summary in test setup");
    return { name, inputs, summary };
  }

  it("costInsight picks the cheaper side and the absolute difference", () => {
    const a = scenario("A", [fixedTrack(400_000)]);
    const b = scenario("B", [fixedTrack(600_000)]);
    const result = costInsight(a, b);
    expect(result.cheaperSide).toBe("a");
    expect(result.diffAbs).toBeGreaterThan(0);
  });

  it("costInsight reports a tie for (near-)identical scenarios", () => {
    const a = scenario("A", [fixedTrack(500_000)]);
    const b = scenario("B", [fixedTrack(500_000)]);
    expect(costInsight(a, b).cheaperSide).toBe("tie");
  });

  it("stabilityInsight picks the more stable side", () => {
    const a = scenario("A", [fixedTrack(500_000)]);
    const b = scenario("B", [primeTrack(500_000)]);
    expect(stabilityInsight(a, b).moreStableSide).toBe("a");
  });

  it("paymentShapeInsight detects 'starts lower, ends higher' for a variable track", () => {
    const fixedOnly = scenario("Fixed", [fixedTrack(500_000)]);
    const primeOnly = scenario("Prime", [
      {
        ...primeTrack(500_000),
        currentCustomerRatePercent: 3.0, // cheaper first payment than fixed
        forecastMode: "stress",
        stressShiftPercent: 5, // pushes the forecast max payment up a lot
      } as MortgageTrackInput,
    ]);
    const result = paymentShapeInsight(fixedOnly, primeOnly);
    expect(result).toEqual({ side: "b" });
  });

  it("paymentShapeInsight returns null when neither scenario shows the pattern", () => {
    const a = scenario("A", [fixedTrack(500_000)]);
    const b = scenario("B", [fixedTrack(500_000)]);
    expect(paymentShapeInsight(a, b)).toBeNull();
  });
});
