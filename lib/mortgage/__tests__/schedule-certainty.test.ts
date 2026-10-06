import { describe, expect, it } from "vitest";
import { scheduleBasisForMonth } from "../schedule-certainty";
import type { MortgageTrackInput } from "../types";

// Synthetic inputs; certainty must not depend on the numerical forecast path.
const base = { loanAmount: 180_000, years: 15, repaymentMethod: "spitzer" as const };
const forecast = { currentCustomerRatePercent: 3, forecastMode: "official" as const, forecastZeroYieldsPercent: [] };
const fixed: MortgageTrackInput = { ...base, type: "fixedUnlinked", annualInterestRatePercent: 3 };
const variable: MortgageTrackInput = { ...base, ...forecast, type: "variableGovernmentBond", resetPeriodMonths: 60 };
const linked: MortgageTrackInput = { ...base, ...forecast, type: "fixedLinked", expectedCpiIndexPath: [] };

describe("schedule calculation basis", () => {
  it.each(["spitzer", "equalPrincipal"] as const)("keeps fixed unlinked %s payments contractual throughout", (repaymentMethod) => {
    for (let month = 1; month <= 180; month++) {
      expect(scheduleBasisForMonth([{ ...fixed, repaymentMethod }], month)).toBe("contractual");
    }
  });

  it.each([24, 30, 36, 60, 84, 120] as const)("changes basis after the %i-month reset, not on it", (resetPeriodMonths) => {
    const track = { ...variable, resetPeriodMonths };
    expect(scheduleBasisForMonth([track], resetPeriodMonths)).toBe("contractual");
    expect(scheduleBasisForMonth([track], resetPeriodMonths + 1)).toBe("rate");
    expect(scheduleBasisForMonth([track], 180)).toBe("rate");
  });

  it("marks Makam from month 13 and prime from month 1", () => {
    const makam: MortgageTrackInput = { ...base, ...forecast, type: "variableMakam", resetPeriodMonths: 12, currentMakamAnchorPercent: 2 };
    const prime: MortgageTrackInput = { ...base, ...forecast, type: "prime", currentBankOfIsraelRatePercent: 2 };
    expect(scheduleBasisForMonth([makam], 12)).toBe("contractual");
    expect(scheduleBasisForMonth([makam], 13)).toBe("rate");
    expect(scheduleBasisForMonth([prime], 1)).toBe("rate");
  });

  it("marks fixed CPI-linked from month 1 and adds rate dependency after a linked reset", () => {
    const variableLinked: MortgageTrackInput = { ...linked, type: "variableLinked", resetPeriodMonths: 60, forecastRealZeroYieldsPercent: [] };
    expect(scheduleBasisForMonth([linked], 1)).toBe("index");
    expect(scheduleBasisForMonth([variableLinked], 60)).toBe("index");
    expect(scheduleBasisForMonth([variableLinked], 61)).toBe("rateAndIndex");
  });

  it.each(["official", "constant", "stress"] as const)("does not confuse %s scenario assumptions with contractual certainty", (forecastMode) => {
    expect(scheduleBasisForMonth([{ ...variable, forecastMode }], 61)).toBe("rate");
    expect(scheduleBasisForMonth([{ ...linked, forecastMode }], 1)).toBe("index");
  });

  it("combines only active tracks, retaining uncertainty through the final payment", () => {
    const tracks = [fixed, { ...variable, years: 10 }, { ...linked, years: 5 }];
    expect(scheduleBasisForMonth(tracks, 1)).toBe("index");
    expect(scheduleBasisForMonth(tracks, 60)).toBe("index");
    expect(scheduleBasisForMonth(tracks, 61)).toBe("rate");
    expect(scheduleBasisForMonth(tracks, 120)).toBe("rate");
    expect(scheduleBasisForMonth(tracks, 121)).toBe("contractual");
    expect(scheduleBasisForMonth([variable, linked], 61)).toBe("rateAndIndex");
  });
});
