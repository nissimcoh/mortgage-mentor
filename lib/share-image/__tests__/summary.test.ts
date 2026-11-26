import { describe, expect, it } from "vitest";
import { prepareForConfirm } from "@/lib/payoff-report/confirm";
import { parsePayoffReportFile } from "@/lib/payoff-report/parse";
import { simulateExistingMortgage } from "@/lib/payoff-report/simulate";
import { fictionalTwoLoanFile } from "@/lib/payoff-report/__tests__/fixtures";
import { buildMortgageSummary, cardColumns, loanTail } from "../summary";

const market = { boiRatePercent: 3, nominalZeroYieldsPercent: [], realZeroYieldsPercent: [], expectedCpiIndex: [] };

function loans() {
  const parsed = parsePayoffReportFile(fictionalTwoLoanFile(), "report.pdf");
  if (!parsed.ok) throw new Error("fixture must parse");
  return prepareForConfirm(parsed.file).loans;
}

describe("buildMortgageSummary", () => {
  it("shows the report's figures per track, with only the loan number's last digits", () => {
    const input = loans();
    const summary = buildMortgageSummary(input, simulateExistingMortgage(input, market));
    expect(summary.tracks).toHaveLength(3);
    for (const track of summary.tracks) expect(track.loanTail ?? "").toMatch(/^\d{0,4}$/);
    expect(summary.tracks.map((track) => track.kind)).toEqual(["fixedUnlinked", "variableLinked", "prime"]);
    expect(summary.tracks[1].nextResetDate).not.toBeNull();
    expect(summary.tracks[0].nextResetDate).toBeNull();
    const settled = summary.tracks.reduce((sum, track) => sum + (track.totalToSettle ?? 0), 0);
    // The loan-level fee is part of the total but of no single track.
    expect(summary.totalToSettle! - settled).toBeCloseTo(60, 2);
    expect(summary.composition.reduce((sum, part) => sum + part.share, 0)).toBeCloseTo(1, 10);
    expect(summary.composition.map((part) => part.share)).toEqual([...summary.composition.map((part) => part.share)].sort((a, b) => b - a));
  });
});

describe("loanTail", () => {
  it("keeps the last four digits only", () => {
    expect(loanTail("10-7071639-01-61")).toBe("0161");
    expect(loanTail("12")).toBe("12");
    expect(loanTail(null)).toBeNull();
    expect(loanTail("—")).toBeNull();
  });
});

describe("cardColumns", () => {
  it("fills one row up to four cards, then balances the rows", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 12].map(cardColumns)).toEqual([1, 2, 3, 4, 3, 3, 4, 4, 3, 4]);
  });
});
