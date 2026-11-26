import { describe, expect, it } from "vitest";
import { prepareForConfirm } from "../confirm";
import { parsePayoffReportFile } from "../parse";
import {
  existingCombinedBases,
  existingMilestones,
  existingTrackBasis,
  simulateExistingMortgage,
  type ExistingMortgageMarket,
} from "../simulate";
import type { PayoffLoan } from "../types";
import { fictionalTwoLoanFile } from "./fixtures";

function loans(): PayoffLoan[] {
  const result = parsePayoffReportFile(fictionalTwoLoanFile(), "report.pdf");
  if (!result.ok) throw new Error("fixture must parse");
  return prepareForConfirm(result.file).loans;
}

/** Flat curves make every forward equal the flat yield. */
function flatMarket(nominal: number, real: number, inflation: number, months = 360): ExistingMortgageMarket {
  return {
    boiRatePercent: 4,
    nominalZeroYieldsPercent: Array.from({ length: months }, () => nominal),
    realZeroYieldsPercent: Array.from({ length: months }, () => real),
    expectedCpiIndex: Array.from({ length: months + 1 }, (_, month) => 100 * Math.pow(1 + inflation / 100, month / 12)),
    curveId: "flat-test",
  };
}

const market = flatMarket(4.5, 1, 2);

function track(simulation: ReturnType<typeof simulateExistingMortgage>, loanIndex: number, trackIndex: number) {
  const found = simulation.tracks.find((item) => item.loanIndex === loanIndex && item.trackIndex === trackIndex);
  if (!found) throw new Error("track not simulated");
  return found;
}

describe("simulateExistingMortgage", () => {
  const simulation = simulateExistingMortgage(loans(), market);

  it("continues a fixed track from today's balance for its remaining payments", () => {
    const fixed = track(simulation, 0, 0);
    expect(fixed.kind).toBe("fixedUnlinked");
    expect(fixed.startBalance).toBe(150000);
    expect(fixed.numberOfPayments).toBe(120);
    expect(fixed.firstPaymentDate).toBe("2026-04-01");
    expect(fixed.lastPaymentDate).toBe("2036-03-01");
    // The report's own payment: balance, rate and term agree.
    expect(fixed.schedule[0].payment).toBeCloseTo(fixed.reportedMonthlyPayment!, 1);
    expect(fixed.schedule.at(-1)!.remainingBalance).toBe(0);
    expect(fixed.assumptions).toEqual([]);
  });

  it("keeps a variable rate until the printed reset, then moves to anchor + margin", () => {
    const variable = track(simulation, 0, 1);
    expect(variable.kind).toBe("variableLinked");
    expect(variable.startBalance).toBe(82400); // principal + accrued linkage
    const rates = variable.schedule.map((entry) => entry.activeAnnualRatePercent!);
    // Payments April 2026 .. September 2028 (30) are at today's 3.1%.
    expect(rates.slice(0, 30).every((rate) => rate === 3.1)).toBe(true);
    // Then the flat 1% real anchor plus the 1.2% contractual margin.
    expect(rates[30]).toBeCloseTo(2.2, 10);
    expect(rates.at(-1)).toBeCloseTo(2.2, 10);
    expect(variable.schedule[1].indexationAmount).toBeGreaterThan(0);
    expect(variable.schedule.at(-1)!.remainingBalance).toBe(0);
  });

  it("follows the prime forecast while keeping today's margin over prime", () => {
    const prime = track(simulation, 1, 0);
    expect(prime.kind).toBe("prime");
    // Margin today: 5.5 − (4 + 1.5) = 0. Flat 4.5% curve: 4.5 + 1.5 + 0 = 6.
    expect(prime.schedule[0].activeAnnualRatePercent).toBeCloseTo(6, 10);
    expect(prime.schedule.at(-1)!.remainingBalance).toBe(0);
  });

  it("holds every rate and drops inflation in constant mode", () => {
    const constant = simulateExistingMortgage(loans(), market, "constant");
    const variable = track(constant, 0, 1);
    expect(variable.schedule.every((entry) => entry.activeAnnualRatePercent === 3.1)).toBe(true);
    expect(variable.schedule.every((entry) => entry.indexationAmount === 0)).toBe(true);
    expect(track(constant, 1, 0).schedule.every((entry) => entry.activeAnnualRatePercent === 5.5)).toBe(true);
  });

  it("skips closed tracks and adds the rest up by calendar month", () => {
    expect(simulation.tracks).toHaveLength(3);
    expect(simulation.skipped).toEqual([]);
    const [first] = simulation.months;
    expect(first.month).toBe("2026-04");
    const firstPayments = simulation.tracks.reduce((sum, item) => sum + item.schedule[0].payment, 0);
    expect(first.payment).toBeCloseTo(firstPayments, 2);
    expect(simulation.totals.firstMonthPayment).toBe(first.payment);
    expect(simulation.totals.lastMonth).toBe("2041-03");
    expect(simulation.months.at(-1)!.balance).toBe(0);
    expect(simulation.totals.startBalance).toBe(150000 + 82400 + 50000);
    expect(simulation.totals.totalCost).toBeCloseTo(simulation.totals.totalPayment - simulation.totals.startBalance, 2);
  });

  it("aligns tracks that start paying in different months", () => {
    const shifted = loans();
    shifted[1].tracks[0].firstPaymentDate = "2026-06-01";
    shifted[1].tracks[0].endDate = "2033-05-01";
    const result = simulateExistingMortgage(shifted, market);
    const [april, may, june] = result.months;
    expect([april.month, may.month, june.month]).toEqual(["2026-04", "2026-05", "2026-06"]);
    const prime = track(result, 1, 0);
    // Before its first payment, the prime track's whole balance is still owed.
    expect(april.balance).toBeGreaterThan(prime.startBalance);
    expect(june.payment).toBeGreaterThan(may.payment);
  });

  it("holds the rate of a track it cannot model, and says so", () => {
    const other = loans();
    other[0].tracks[1].variable!.anchorSeries = "other";
    const held = track(simulateExistingMortgage(other, market), 0, 1);
    expect(held.kind).toBe("heldConstant");
    expect(held.assumptions).toContain("rateHeldConstant");
    expect(held.schedule.every((entry) => entry.activeAnnualRatePercent === 3.1)).toBe(true);
  });

  it("resets a Makam track every 12 months on the nominal curve", () => {
    const makam = loans();
    const variable = makam[0].tracks[1];
    makam[0].tracks[1] = {
      ...variable,
      linkage: "unlinked",
      balance: { ...variable.balance, indexation: null },
      variable: { ...variable.variable!, resetFrequencyMonths: 12, nextResetDate: "2026-09-01", anchorSeries: "makam" },
    };
    const result = track(simulateExistingMortgage(makam, market), 0, 1);
    const rates = result.schedule.map((entry) => entry.activeAnnualRatePercent!);
    expect(result.kind).toBe("variableUnlinked");
    expect(rates.slice(0, 6).every((rate) => rate === 3.1)).toBe(true); // April..September
    expect(rates[6]).toBeCloseTo(4.5 + 1.2, 10);
  });

  it("extends a curve that is shorter than the term, and says so", () => {
    const short = simulateExistingMortgage(loans(), flatMarket(4.5, 1, 2, 120));
    expect(track(short, 0, 1).assumptions).toContain("curveExtended");
    expect(track(short, 0, 1).schedule.at(-1)!.remainingBalance).toBe(0);
    expect(track(short, 0, 0).assumptions).toEqual([]);
  });

  it.each([0, -1, 0.5])("flags an invalid reset interval of %s for correction", (period) => {
    const input = loans();
    input[0].tracks[1].variable!.resetFrequencyMonths = period;
    for (const mode of ["official", "constant"] as const) {
      expect(simulateExistingMortgage(input, market, mode).skipped).toEqual([{ loanIndex: 0, trackIndex: 1, reason: "missingFields" }]);
    }
  });

  it("skips tracks missing what a simulation needs", () => {
    const missing = loans();
    missing[0].tracks[0].annualRatePercent = null;
    const result = simulateExistingMortgage(missing, market);
    expect(result.skipped).toEqual([{ loanIndex: 0, trackIndex: 0, reason: "missingFields" }]);
  });
});

describe("combined schedule and forecast basis", () => {
  const simulation = simulateExistingMortgage(loans(), market);

  it("mirrors the monthly totals in engine format", () => {
    const { combinedSchedule, months } = simulation;
    expect(combinedSchedule).toHaveLength(months.length);
    expect(combinedSchedule[0]).toMatchObject({
      month: 1,
      payment: months[0].payment,
      remainingBalance: months[0].balance,
      openingBalance: simulation.totals.startBalance,
    });
    expect(combinedSchedule[1].openingBalance).toBe(months[0].balance);
    // Weighted between the tracks' rates (3.1% to 6%).
    expect(combinedSchedule[0].activeAnnualRatePercent).toBeGreaterThan(3.1);
    expect(combinedSchedule[0].activeAnnualRatePercent).toBeLessThan(6);
  });

  it("marks which payments depend on a forecast", () => {
    const [fixed, variable, prime] = [0, 1, 2].map((index) => simulation.tracks[index]);
    expect(existingTrackBasis(fixed, 1)).toBe("contractual");
    expect(existingTrackBasis(variable, 30)).toBe("index");
    expect(existingTrackBasis(variable, 31)).toBe("rateAndIndex");
    expect(existingTrackBasis(prime, 1)).toBe("rate");
    const bases = existingCombinedBases(simulation);
    expect(bases[0]).toBe("rateAndIndex");
    // After the prime and linked tracks end, only the fixed track remains... until 2036.
    expect(bases).toHaveLength(simulation.combinedSchedule.length);
  });

  it("calls nothing a forecast in constant mode", () => {
    const constant = simulateExistingMortgage(loans(), market, "constant");
    expect(existingCombinedBases(constant).every((basis) => basis === "contractual")).toBe(true);
  });
});

describe("existingMilestones", () => {
  it("marks the printed reset, later resets and each track's last payment", () => {
    const simulation = simulateExistingMortgage(loans(), market);
    const variable = simulation.tracks.findIndex((track) => track.kind === "variableLinked");
    expect(simulation.tracks[variable].resetPayments).toEqual([31, 91, 151]);
    const milestones = existingMilestones(simulation);
    const months = (kind: "reset" | "end", trackIndex: number) =>
      milestones.filter((milestone) => milestone.events.some((event) => event.kind === kind && event.trackIndex === trackIndex)).map((milestone) => milestone.month);
    // Combined month 31 is October 2028, right after the September reset date.
    expect(months("reset", variable)).toEqual([31, 91, 151]);
    expect(simulation.months[30].month).toBe("2028-10");
    // Last payments: fixed March 2036 (120), variable March 2041 (180), prime March 2033 (84).
    expect(simulation.tracks.map((_, index) => months("end", index)[0])).toEqual([120, 180, 84]);
    expect(milestones.map((milestone) => milestone.month)).toEqual([...milestones.map((milestone) => milestone.month)].sort((a, b) => a - b));
  });

  it("keeps contractual resets in constant mode, and shifts late-starting tracks", () => {
    expect(existingMilestones(simulateExistingMortgage(loans(), market, "constant")).some((m) => m.events.some((e) => e.kind === "reset"))).toBe(true);
    const shifted = loans();
    shifted[1].tracks[0].firstPaymentDate = "2026-06-01";
    shifted[1].tracks[0].endDate = "2033-05-01";
    const simulation = simulateExistingMortgage(shifted, market);
    const prime = simulation.tracks.findIndex((track) => track.kind === "prime");
    const end = existingMilestones(simulation).find((m) => m.events.some((e) => e.kind === "end" && e.trackIndex === prime));
    expect(end?.month).toBe(2 + 84); // starts two months after the others
  });
});
