import { describe, expect, it } from "vitest";
import { prepareForConfirm } from "../confirm";
import { parsePayoffReportFile } from "../parse";
import { currentMixHref, longestRemainingMonths, newMixHref } from "../to-calculator";
import type { PayoffLoan } from "../types";
import { fictionalTwoLoanFile } from "./fixtures";

function loans(): PayoffLoan[] {
  const result = parsePayoffReportFile(fictionalTwoLoanFile(), "report.pdf");
  if (!result.ok) throw new Error("fixture must parse");
  return prepareForConfirm(result.file).loans;
}

function params(href: string) {
  const [path, query] = href.split("?");
  return { path, query: Object.fromEntries(new URLSearchParams(query)) };
}

describe("newMixHref", () => {
  it("opens one fixed track on the amount over the term in whole years", () => {
    expect(params(newMixHref("he", 284378.25, 180))).toEqual({
      path: "/he/calculator",
      query: {
        trackCount: "1",
        track1Amount: "284378",
        track1Years: "15",
        track1Type: "fixedUnlinked",
        track1RepaymentMethod: "spitzer",
      },
    });
  });

  it("keeps the term within the calculator's range", () => {
    expect(params(newMixHref("en", 1000, 400)).query.track1Years).toBe("30");
    expect(params(newMixHref("en", 1000, 3)).query.track1Years).toBe("1");
  });
});

describe("longestRemainingMonths", () => {
  it("is the longest active track's remaining payments", () => {
    expect(longestRemainingMonths(loans())).toBe(180);
    expect(longestRemainingMonths([])).toBe(0);
  });
});

describe("currentMixHref", () => {
  it("rebuilds each active track, adding up to the balance to settle", () => {
    const result = currentMixHref("he", loans())!;
    const { query } = params(result.href);
    expect(query.trackCount).toBe("3");
    // Fixed track: its total to settle plus the loan's one-off 60 fee.
    expect(query).toMatchObject({ track1Type: "fixedUnlinked", track1Amount: "151588", track1Years: "10", track1AnnualInterestRatePercent: "4.8" });
    // Variable CPI-linked, 60-month reset, 15 years left.
    expect(query).toMatchObject({ track2Type: "variableLinked", track2Amount: "82672", track2Years: "15", track2ResetPeriodMonths: "60", track2CurrentRatePercent: "3.1" });
    expect(query).toMatchObject({ track3Type: "prime", track3Amount: "50118", track3Years: "7", track3CurrentRatePercent: "5.5" });
    const total = [1, 2, 3].reduce((sum, n) => sum + Number(query[`track${n}Amount`]), 0);
    expect(total).toBe(Math.round(151527.71 + 60 + 82672.47) + 50118);
    // The variable track restarts its reset cycle in the calculator.
    expect(result.approximated).toBe(true);
  });

  it("keeps the remaining term when only the last payment date is printed", () => {
    const loan = loans()[0];
    const track = loan.tracks[0];
    track.firstPaymentDate = null;
    track.balance.totalToSettle = null;
    const input = [{ ...loan, tracks: [track] }];
    expect(longestRemainingMonths(input)).toBe(120);
    expect(params(currentMixHref("he", input)!.href).query).toMatchObject({ track1Years: "10", track1Amount: "151588" });
  });

  it("is exact for fixed tracks whose terms are whole years", () => {
    const fixedOnly = loans().map((loan) => ({ ...loan, tracks: loan.tracks.filter((track) => track.rateType === "fixed") }));
    expect(currentMixHref("he", fixedOnly)?.approximated).toBe(false);
  });

  it("snaps a government-bond track to the calculator's reset and term options", () => {
    const changed = loans();
    const variable = changed[0].tracks[1];
    changed[0].tracks[1] = {
      ...variable,
      linkage: "unlinked",
      balance: { ...variable.balance, indexation: null },
      variable: { ...variable.variable!, resetFrequencyMonths: 24, anchorSeries: "governmentBondUnlinked" },
    };
    const { query } = params(currentMixHref("he", changed)!.href);
    expect(query).toMatchObject({ track2Type: "variableGovernmentBond", track2ResetPeriodMonths: "24", track2Years: "14" });
  });

  it("gives up rather than drop tracks when there are more than the calculator holds", () => {
    const many = loans();
    many[0].tracks = [...many[0].tracks, ...many[0].tracks.slice(0, 2), ...many[0].tracks.slice(0, 2)];
    expect(currentMixHref("he", many)).toBeNull();
  });

  it("gives up when a track lacks what the calculator needs", () => {
    const missing = loans();
    missing[0].tracks[0].annualRatePercent = null;
    expect(currentMixHref("he", missing)).toBeNull();
  });
});
