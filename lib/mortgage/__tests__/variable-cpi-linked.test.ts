import { describe, expect, it } from "vitest";
import { calculateScenarioSummary, calculateTrackSummary, calculateMonthlyPaymentForSpitzer, type VariableCpiLinkedTrackInput } from "../index";
import { createTrackDraft, parseAllTrackDrafts, pinCalculatedDrafts, applyTracksToQuery, parseTracksFromQuery, validateTrackDraft } from "../scenario-form";
import { createFallbackForecastCurve } from "../../market-data/mortgage-forecast-fallback";
import { buildCalculatorMarketData } from "../../market-data/build-calculator-market-data";

const curve = createFallbackForecastCurve("2026-07-12T00:00:00Z");
const track: VariableCpiLinkedTrackInput = {
  type: "variableLinked", repaymentMethod: "spitzer", loanAmount: 500_000,
  years: 20, currentCustomerRatePercent: 3, resetPeriodMonths: 60,
  forecastRealZeroYieldsPercent: Array(360).fill(2),
  expectedCpiIndexPath: Array.from({length: 361}, (_, month) => 100 * 1.002 ** month),
  forecastMode: "official",
};

describe("five-year variable CPI-linked mortgage", () => {
  it("matches fixed-linked payments throughout the initial contractual block", () => {
    const variable = calculateTrackSummary(track);
    const fixed = calculateTrackSummary({ ...track, type: "fixedLinked" });
    expect(variable.cpiForecast!.currentFirstPayment).toBe(2772.99);
    for (let month = 0; month < 60; month++) {
      expect(variable.schedule[month].payment).toBe(fixed.schedule[month].payment);
      expect(variable.schedule[month].remainingBalance).toBe(fixed.schedule[month].remainingBalance);
      expect(variable.schedule[month].activeAnnualRatePercent).toBe(3);
    }
  });

  it("uses the real forward anchor and reprices month 61 on the indexed remaining debt", () => {
    const realCurve = Array.from({length: 360}, (_, month) => month < 60 ? 2 : 4);
    const summary = calculateTrackSummary({ ...track, forecastRealZeroYieldsPercent: realCurve });
    // Independent five-year forward identity, with customer margin 3 − 2 = 1 pp.
    const resetRate = ((1.04 ** 10 / 1.02 ** 5) ** (1 / 5) - 1) * 100 + 1;
    expect(summary.schedule[59].activeAnnualRatePercent).toBe(3);
    expect(summary.schedule[60].activeAnnualRatePercent).toBeCloseTo(resetRate, 10);
    const reset = summary.schedule[60];
    const indexedOpening = reset.openingBalance! * 1.002;
    expect(reset.payment).toBeCloseTo(calculateMonthlyPaymentForSpitzer({
      loanAmount: indexedOpening, years: 15, annualInterestRatePercent: resetRate,
    }), 1);
    expect(summary.schedule[61].payment / reset.payment).toBeCloseTo(1.002, 5);
  });

  it("rate stress starts at reset; inflation stress affects the first indexed payment", () => {
    const base = calculateTrackSummary(track);
    const rateStress = calculateTrackSummary({...track, forecastMode: "stress", stressShiftPercent: 1});
    const cpiStress = calculateTrackSummary({...track, forecastMode: "stress", inflationStressShiftPercent: 1});
    expect(rateStress.schedule.slice(0, 60)).toEqual(base.schedule.slice(0, 60));
    expect(rateStress.schedule[60].payment).toBeGreaterThan(base.schedule[60].payment);
    expect(cpiStress.firstPayment).toBeGreaterThan(base.firstPayment);
    expect(cpiStress.cpiForecast!.currentFirstPayment).toBe(base.cpiForecast!.currentFirstPayment);
  });

  it("constant mode ignores both forecast paths and both stress shifts", () => {
    const summary = calculateTrackSummary({...track, forecastMode: "constant", forecastRealZeroYieldsPercent: [], expectedCpiIndexPath: [], stressShiftPercent: 7, inflationStressShiftPercent: 8});
    expect(summary.firstPayment).toBe(2772.99);
    expect(summary.schedule.every(row => row.indexationAmount === 0)).toBe(true);
    expect(summary.schedule.every(row => row.activeAnnualRatePercent === 3)).toBe(true);
    expect(summary.finalBalance).toBe(0);
  });

  it("balances the schedule, financing cost and a mixed mortgage with unequal durations", () => {
    const short = {...track, years: 10};
    const summary = calculateScenarioSummary({tracks: [short, {...track, type: "fixedLinked"}]});
    const shortSummary = summary.trackSummaries[0];
    for (const row of shortSummary.schedule) {
      expect(row.payment).toBeCloseTo(row.principalPayment + row.interestPayment, 1);
      expect(row.remainingBalance).toBeCloseTo(row.openingBalance! + row.indexationAmount! - row.principalPayment, 1);
    }
    expect(shortSummary.finalBalance).toBe(0);
    expect(summary.combinedSchedule[120].payment).toBe(summary.trackSummaries[1].schedule[120].payment);
    expect(summary.totalInterest).toBeCloseTo(summary.totalPayment - 1_000_000, 2);
  });

  it("allows deflation and finite negative forecast rates without silently flooring", () => {
    const summary = calculateTrackSummary({...track, forecastMode: "stress", stressShiftPercent: -4, expectedCpiIndexPath: Array.from({length:361},(_,m)=>100 * .999 ** m)});
    expect(summary.schedule[0].indexationAmount).toBeLessThan(0);
    expect(summary.schedule[60].activeAnnualRatePercent).toBeLessThan(0);
    expect(summary.schedule.every(row => Number.isFinite(row.payment))).toBe(true);
    expect(summary.finalBalance).toBe(0);
  });

  it("rejects unsupported resets, incomplete real curves and invalid inflation inputs", () => {
    expect(() => calculateTrackSummary({...track, resetPeriodMonths: 24} as unknown as VariableCpiLinkedTrackInput)).toThrow(/five-year/);
    expect(() => calculateTrackSummary({...track, forecastRealZeroYieldsPercent: [2]})).toThrow(/real zero/);
    expect(() => calculateTrackSummary({...track, forecastRealZeroYieldsPercent: Array(360).fill(NaN)})).toThrow(/real zero/);
    expect(() => calculateTrackSummary({...track, forecastMode: "stress", inflationStressShiftPercent: -100})).toThrow(/multiplier/);
  });
});

describe("variable-linked form, persistence and market wiring", () => {
  const market = {boiRatePercent: 3.5, curves: [curve]};
  const draft = createTrackDraft({trackType:"variableLinked", amount:"500000", years:"20", resetPeriodMonths:"60", currentRatePercent:"3", forecastMode:"stress", stressShift:"1", inflationStressShift:"2"});
  it("uses real rather than nominal yields and preserves both stresses through a pinned URL", () => {
    const inputs = parseAllTrackDrafts([draft], market)!;
    expect(inputs[0].type).toBe("variableLinked");
    if (inputs[0].type !== "variableLinked") throw new Error("wrong track type");
    expect(inputs[0].forecastRealZeroYieldsPercent).toEqual(curve.realZeroYieldsPercent);
    expect(inputs[0].stressShiftPercent).toBe(1);
    expect(inputs[0].inflationStressShiftPercent).toBe(2);
    const query = applyTracksToQuery(new URLSearchParams(), pinCalculatedDrafts([draft], inputs));
    expect(query.get("track1ForecastCurveId")).toBe(curve.id);
    expect(parseAllTrackDrafts(parseTracksFromQuery(query)!, market)).toEqual(inputs);
  });
  it("does not calculate with missing real/CPI data or unsupported reset periods", () => {
    expect(parseAllTrackDrafts([draft], {...market, curves:[{...curve, realZeroYieldsPercent:[]}]})).toBeNull();
    expect(parseAllTrackDrafts([draft], {...market, curves:[{...curve, expectedCpiIndex:[]}]})).toBeNull();
    expect(parseAllTrackDrafts([{...draft,resetPeriodMonths:"24"}], market)).toBeNull();
    expect(validateTrackDraft({...draft,resetPeriodMonths:"24"}).resetPeriodMonths).toBe("resetPeriodInvalid");
  });
  it("market shaping carries the real curve to the client", () => {
    // Minimal source metadata; the assertion concerns the actual client boundary.
    const result = buildCalculatorMarketData({boiRate:{ratePercent:3.5,effectiveDate:"2026-01-01",isLive:false},nextDecision:{at:null},fetchedAt:"2026-07-12"} as Parameters<typeof buildCalculatorMarketData>[0], {curves:[curve],status:"fallback"} as Parameters<typeof buildCalculatorMarketData>[1], {snapshots:[],status:"fallback",missingSnapshotIds:[],errors:[]} as Parameters<typeof buildCalculatorMarketData>[2]);
    expect(result.curves[0].realZeroYieldsPercent).toHaveLength(360);
    expect(result.curves[0].realZeroYieldsPercent).toEqual(curve.realZeroYieldsPercent);
  });
});
