import { writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { calculateScenarioSummary } from "../index";
import { createTrackDraft, parseTrackDraft } from "../scenario-form";
import fixture from "./fixtures/leumi-calibration-2026-10-18.json";

const references = fixture.captures.filter(c => c.case.type !== "fixedUnlinked");
function calculate(c: typeof fixture.captures[number]) {
  const input = parseTrackDraft(createTrackDraft({
    trackType: c.case.type, amount: "500000", years: String(c.case.years),
    ratePercent: "4.5", currentRatePercent: "4.5", forecastMode: "official",
    resetPeriodMonths: String(c.case.reset ?? ""),
    forecastCurveId: fixture.market.curves[0].id,
    makamSnapshotId: fixture.market.makamSnapshots[0].id,
  }), fixture.market);
  expect(input).not.toBeNull();
  return calculateScenarioSummary({ tracks: [input!] });
}

afterAll(() => {
  if (process.env.REPORT_BANK_CALIBRATION !== "1") return;
  const comparisons = fixture.captures.map(c => {
    const actual = calculate(c);
    const monthly = c.bank.loansRepayment[0].monthlyPayments;
    return { case: c.case, currentFirst: actual.currentCombinedFirstPayment,
      maximum: actual.maximumPayment, total: actual.totalPayment,
      irr: actual.forecastOverallRatePercent,
      totalDifference: actual.totalPayment - c.bank.totalAmountPaid,
      maxMonthlyDifference: Math.max(...monthly.map((row, index) => Math.abs(row.monthlyPayment - actual.trackSummaries[0].schedule[index].payment))),
    };
  });
  writeFileSync("/tmp/mortgage-bank-calibration-comparison.json", JSON.stringify({ capturedAt: fixture.capturedAt, comparisons }, null, 2));
});

describe.each(references)("Leumi monthly capture: $case.type / $case.reset", c => {
  const actual = calculate(c);
  const bank = c.bank;
  const monthly = bank.loansRepayment[0].monthlyPayments;
  it("matches current first payment, forecast maximum, total and displayed IRR", () => {
    expect(actual.currentCombinedFirstPayment).toBe(bank.totalFirstPayment);
    expect(Math.abs(actual.maximumPayment - bank.totalHighestPayment)).toBeLessThan(0.011);
    expect(Math.abs(actual.totalPayment - bank.totalAmountPaid)).toBeLessThanOrEqual(1);
    expect(Math.abs(actual.forecastOverallRatePercent - bank.totalIrr)).toBeLessThanOrEqual(0.01);
    expect(actual.finalBalance).toBe(0);
  });
  it("matches every forecast monthly payment, including both sides of every reset", () => {
    const rows = actual.trackSummaries[0].schedule;
    expect(rows).toHaveLength(c.case.years * 12);
    expect(rows).toHaveLength(monthly.length);
    // Prime forwards derive from BOI yields rounded to four decimals; the
    // bank splits interest/principal with up to two agorot difference.
    const splitTolerance = c.case.type === "prime" ? 0.021 : 0.011;
    monthly.forEach((reference, index) => {
      expect(rows[index].month).toBe(reference.month);
      expect(Math.abs(rows[index].payment - reference.monthlyPayment), `month ${index + 1}`).toBeLessThan(0.011);
      expect(Math.abs(rows[index].interestPayment - reference.interestPaid), `interest month ${index + 1}`).toBeLessThan(splitTolerance);
      expect(Math.abs(rows[index].principalPayment - reference.principalPaid), `principal month ${index + 1}`).toBeLessThan(splitTolerance);
    });
  });
});

it("keeps the fixed cash-payment convention explicit rather than hiding a final payoff adjustment", () => {
  const c = fixture.captures.find(c => c.case.type === "fixedUnlinked")!;
  const actual = calculate(c);
  const rows = actual.trackSummaries[0].schedule;
  const bank = c.bank.loansRepayment[0].monthlyPayments;
  expect(actual.currentCombinedFirstPayment).toBe(c.bank.totalFirstPayment);
  expect(rows.slice(0, -1).every((row, index) => row.payment === bank[index].monthlyPayment)).toBe(true);
  // Our fixed cash schedule debits rounded agorot and clears the remaining
  // debt at maturity. The bank's forecast keeps its unrounded base payment.
  expect(rows.at(-1)!.payment).toBe(3162.04);
  expect(bank.at(-1)!.monthlyPayment).toBe(3163.25);
  expect(actual.finalBalance).toBe(0);
});

it("does not introduce an observed-Makam/zero-curve basis spread into forecast resets", () => {
  const c = fixture.captures.find(c => c.case.type === "variableMakam")!;
  const original = calculate(c);
  const changedObservation = structuredClone(fixture.market);
  changedObservation.makamSnapshots[0].anchorPercent += 0.5;
  const input = parseTrackDraft(createTrackDraft({trackType: "variableMakam", amount: "500000", years: "20", currentRatePercent: "4.5", forecastMode: "official"}), changedObservation)!;
  const changed = calculateScenarioSummary({ tracks: [input] });
  expect(changed.combinedSchedule).toEqual(original.combinedSchedule);
  expect(changed.trackSummaries[0].variableForecast!.makamObservedSpreadPercent).not.toBe(original.trackSummaries[0].variableForecast!.makamObservedSpreadPercent);
});
