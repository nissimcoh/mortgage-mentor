import { expect, it } from "vitest";
import { buildMortgageMilestones } from "../milestones";
import type { MortgageTrackInput } from "../types";

const variable: MortgageTrackInput = {
  type: "variableGovernmentBond", repaymentMethod: "spitzer", loanAmount: 180000,
  years: 20, currentCustomerRatePercent: 3, resetPeriodMonths: 60,
  forecastMode: "official", forecastZeroYieldsPercent: [],
};

it("places a five-year reset on payment 61, and never after the track ends", () => {
  expect(buildMortgageMilestones([variable])).toEqual([
    { month: 61, events: [{ trackIndex: 0, kind: "reset" }] },
    { month: 121, events: [{ trackIndex: 0, kind: "reset" }] },
    { month: 181, events: [{ trackIndex: 0, kind: "reset" }] },
    { month: 240, events: [{ trackIndex: 0, kind: "end" }] },
  ]);
  expect(buildMortgageMilestones([{ ...variable, years: 5 }])).toEqual([
    { month: 60, events: [{ trackIndex: 0, kind: "end" }] },
  ]);
});

it("groups coincident resets and end payments without losing track identities", () => {
  const actual = buildMortgageMilestones([
    { ...variable, years: 10, resetPeriodMonths: 24 },
    { ...variable, years: 10, resetPeriodMonths: 60 },
  ]);
  expect(actual.find(event => event.month === 121)).toBeUndefined();
  expect(actual.at(-1)).toEqual({ month: 120, events: [{ trackIndex: 0, kind: "end" }, { trackIndex: 1, kind: "end" }] });
  expect(actual.map(event => event.month)).toEqual([25, 49, 61, 73, 97, 120]);
});

it("retains contractual reset dates for constant-rate assumptions and half-year intervals", () => {
  const actual = buildMortgageMilestones([{ ...variable, years: 7.5, resetPeriodMonths: 30, forecastMode: "constant" }]);
  expect(actual.map(event => event.month)).toEqual([31, 61, 90]);
});

it("does not invent scheduled resets for prime or CPI linkage", () => {
  const common = { repaymentMethod: "spitzer" as const, loanAmount: 180000, years: 10, currentCustomerRatePercent: 3, forecastMode: "official" as const };
  const actual = buildMortgageMilestones([
    { ...common, type: "prime", currentBankOfIsraelRatePercent: 2, forecastZeroYieldsPercent: [] },
    { ...common, type: "fixedLinked", expectedCpiIndexPath: [] },
  ]);
  expect(actual).toEqual([{ month: 120, events: [{ trackIndex: 0, kind: "end" }, { trackIndex: 1, kind: "end" }] }]);
});

it("handles annual Makam and an empty mix", () => {
  expect(buildMortgageMilestones([])).toEqual([]);
  const makam: MortgageTrackInput = { ...variable, type: "variableMakam", years: 2, resetPeriodMonths: 12, currentMakamAnchorPercent: 2 };
  expect(buildMortgageMilestones([makam]).map(event => event.month)).toEqual([13, 24]);
});
