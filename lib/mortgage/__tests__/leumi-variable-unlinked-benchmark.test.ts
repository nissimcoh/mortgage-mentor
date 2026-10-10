import { expect, it } from "vitest";
import { calculateScenarioSummary } from "../index";
import fixture from "./fixtures/leumi-variable-unlinked-2026-10-05.json";

it("matches Leumi's corrected October 5 five-year unlinked screenshot", () => {
  // Frozen capture-date curve: this historical comparison must not move
  // when a newer forecast becomes active. Expected outputs come from the
  // user's bank screenshot, not from a snapshot of our engine's output.
  const actual = calculateScenarioSummary({
    tracks: [{
      type: "variableGovernmentBond",
      repaymentMethod: "spitzer",
      ...fixture.input,
      resetPeriodMonths: 60,
      forecastMode: "official",
      forecastCurveId: fixture.curve.id,
      forecastCurvePublicationDate: fixture.curve.publicationDate,
      forecastZeroYieldsPercent: fixture.curve.nominalZeroYieldsPercent,
    }],
  });
  const bank = fixture.expectedBankDisplay;
  // The bank only exposes whole shekels. Allow sub-shekel differences
  // without assuming truncation or inventing its hidden decimal values.
  for (const [value, displayed] of [
    [actual.currentCombinedFirstPayment, bank.firstPayment],
    [actual.maximumPayment, bank.maximumPayment],
    [actual.totalPayment, bank.totalPayment],
  ]) {
    expect(Math.abs(value - displayed)).toBeLessThan(1);
  }
  expect(Number(actual.forecastOverallRatePercent.toFixed(2))).toBe(
    bank.forecastOverallRatePercent,
  );
});
