import { describe, expect, it } from "vitest";
import {
  annualPercentToMonthlyRate,
  nominalAnnualPercentToEffectiveAnnualPercent,
  calculateMonthlyPaymentForSpitzer,
  calculateScenarioSummary,
  calculateTrackSummary,
  generateSpitzerSchedule,
  type MortgageTrackInput,
} from "../index";

/** Reference track: 800,000 ILS @ 4.8% nominal for 25 years, Spitzer. */
const referenceTrack: MortgageTrackInput = {
  type: "fixedUnlinked",
  repaymentMethod: "spitzer",
  loanAmount: 800_000,
  annualInterestRatePercent: 4.8,
  interestRateInputMode: "nominalAnnual",
  years: 25,
};

describe("fixedUnlinked + spitzer reference example", () => {
  const summary = calculateTrackSummary(referenceTrack);

  it("computes the expected monthly payment", () => {
    expect(summary.monthlyPayment).toBeCloseTo(4583.98, 2);
  });

  it("computes the expected total interest", () => {
    expect(summary.totalInterest).toBeCloseTo(575_191.51, 2);
  });

  it("produces 300 payments and ends at a zero balance", () => {
    expect(summary.numberOfPayments).toBe(300);
    expect(summary.finalBalance).toBe(0);
    expect(summary.schedule).toHaveLength(300);
    expect(summary.schedule[299].remainingBalance).toBe(0);
  });

  it("agrees with the standalone payment and schedule functions", () => {
    expect(calculateMonthlyPaymentForSpitzer(referenceTrack)).toBe(
      summary.monthlyPayment,
    );
    expect(generateSpitzerSchedule(referenceTrack)).toEqual(summary.schedule);
  });

  it("charges exactly one month of interest in the first row", () => {
    // 800,000 * (4.8% / 12) = 3,200
    expect(summary.schedule[0].interestPayment).toBeCloseTo(3200, 2);
  });

  it("keeps every row internally consistent (payment = principal + interest)", () => {
    for (const entry of summary.schedule) {
      expect(entry.payment).toBeCloseTo(
        entry.principalPayment + entry.interestPayment,
        1,
      );
    }
  });

  it("keeps totals consistent with the schedule", () => {
    const summedPayments = summary.schedule.reduce(
      (sum, entry) => sum + entry.payment,
      0,
    );
    expect(summary.totalPayment).toBeCloseTo(summedPayments, 2);
    expect(summary.totalInterest).toBeCloseTo(
      summary.totalPayment - referenceTrack.loanAmount,
      2,
    );
  });
});

describe("interest rate input modes", () => {
  it("converts nominal annual to monthly by dividing by 12", () => {
    expect(annualPercentToMonthlyRate(4.8, "nominalAnnual")).toBeCloseTo(
      0.004,
      10,
    );
  });

  it("converts effective annual via the 12th root", () => {
    expect(annualPercentToMonthlyRate(4.8, "effectiveAnnual")).toBeCloseTo(
      Math.pow(1.048, 1 / 12) - 1,
      10,
    );
  });

  it("effectiveAnnual yields a lower monthly payment than nominalAnnual", () => {
    const nominal = calculateMonthlyPaymentForSpitzer(referenceTrack);
    const effective = calculateMonthlyPaymentForSpitzer({
      ...referenceTrack,
      interestRateInputMode: "effectiveAnnual",
    });
    expect(effective).toBeLessThan(nominal);
  });

  it("converts a nominal annual percent to an effective annual percent", () => {
    expect(nominalAnnualPercentToEffectiveAnnualPercent(4.8)).toBeCloseTo(
      (Math.pow(1 + 0.048 / 12, 12) - 1) * 100,
      10,
    );
    expect(nominalAnnualPercentToEffectiveAnnualPercent(4.8)).toBeCloseTo(
      4.907,
      3,
    );
    expect(nominalAnnualPercentToEffectiveAnnualPercent(0)).toBe(0);
    expect(() => nominalAnnualPercentToEffectiveAnnualPercent(-1)).toThrow(
      /negative/,
    );
  });

  it("defaults to nominalAnnual when the mode is omitted", () => {
    const { interestRateInputMode: _omitted, ...withoutMode } = referenceTrack;
    expect(calculateMonthlyPaymentForSpitzer(withoutMode)).toBe(
      calculateMonthlyPaymentForSpitzer(referenceTrack),
    );
  });
});

describe("zero interest", () => {
  const summary = calculateTrackSummary({
    ...referenceTrack,
    annualInterestRatePercent: 0,
    years: 10,
  });

  it("splits the principal evenly across payments", () => {
    expect(summary.monthlyPayment).toBeCloseTo(800_000 / 120, 2);
  });

  it("charges no interest and repays exactly the principal", () => {
    expect(summary.totalInterest).toBe(0);
    expect(summary.totalPayment).toBeCloseTo(800_000, 2);
    expect(summary.finalBalance).toBe(0);
  });
});

describe("input validation", () => {
  it("rejects a non-positive loan amount", () => {
    expect(() =>
      calculateTrackSummary({ ...referenceTrack, loanAmount: -1 }),
    ).toThrow(/loanAmount/);
    expect(() =>
      calculateTrackSummary({ ...referenceTrack, loanAmount: 0 }),
    ).toThrow(/loanAmount/);
  });

  it("rejects non-positive years", () => {
    expect(() => calculateTrackSummary({ ...referenceTrack, years: 0 })).toThrow(
      /years/,
    );
    expect(() =>
      calculateTrackSummary({ ...referenceTrack, years: -5 }),
    ).toThrow(/years/);
  });

  it("rejects a negative annual interest rate", () => {
    expect(() =>
      calculateTrackSummary({
        ...referenceTrack,
        annualInterestRatePercent: -0.1,
      }),
    ).toThrow(/negative/);
  });
});

describe("unsupported inputs fail loudly", () => {
  it("throws a clear error for a not-yet-implemented track type", () => {
    expect(() =>
      calculateTrackSummary({ ...referenceTrack, type: "prime" }),
    ).toThrow(/"prime" is not implemented yet/);
  });

  it("throws a clear error for a not-yet-implemented repayment method", () => {
    expect(() =>
      calculateTrackSummary({ ...referenceTrack, repaymentMethod: "balloon" }),
    ).toThrow(/"balloon" is not implemented yet/);
  });

  it("rejects an empty scenario", () => {
    expect(() => calculateScenarioSummary({ tracks: [] })).toThrow(
      /at least one track/,
    );
  });
});

describe("multi-track scenario", () => {
  const shortTrack: MortgageTrackInput = {
    ...referenceTrack,
    loanAmount: 400_000,
    annualInterestRatePercent: 3.9,
    years: 10,
  };
  const scenario = calculateScenarioSummary({
    name: "mix",
    tracks: [referenceTrack, shortTrack],
  });

  it("combines the first-month payments of all tracks", () => {
    const [long, short] = scenario.trackSummaries;
    expect(scenario.monthlyPayment).toBeCloseTo(
      long.monthlyPayment + short.monthlyPayment,
      1,
    );
  });

  it("runs for the duration of the longest track", () => {
    expect(scenario.numberOfPayments).toBe(300);
    expect(scenario.combinedSchedule).toHaveLength(300);
  });

  it("continues after the shorter track ends, with a lower payment", () => {
    const lastShared = scenario.combinedSchedule[119]; // month 120
    const firstAlone = scenario.combinedSchedule[120]; // month 121
    expect(firstAlone.payment).toBeLessThan(lastShared.payment);
    // From month 121 on, only the 25-year track is paying.
    expect(firstAlone.payment).toBeCloseTo(
      scenario.trackSummaries[0].schedule[120].payment,
      2,
    );
  });

  it("sums totals across tracks and ends at a zero balance", () => {
    const [long, short] = scenario.trackSummaries;
    expect(scenario.totalPayment).toBeCloseTo(
      long.totalPayment + short.totalPayment,
      2,
    );
    expect(scenario.totalInterest).toBeCloseTo(
      long.totalInterest + short.totalInterest,
      2,
    );
    expect(scenario.finalBalance).toBe(0);
  });
});
