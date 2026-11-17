import { describe, expect, it } from "vitest";
import {
  missingLoanFields,
  missingTrackFields,
  suggestAnchorSeries,
  withSuggestedAnchors,
} from "../confirm";
import { parsePayoffReportFile } from "../parse";
import type { PayoffReportFile } from "../types";
import { fictionalTwoLoanFile } from "./fixtures";

function file(): PayoffReportFile {
  const result = parsePayoffReportFile(fictionalTwoLoanFile(), "report.pdf");
  if (!result.ok) throw new Error("fixture must parse");
  return result.file;
}

describe("missingTrackFields", () => {
  it("asks only for the anchor series on a complete variable track", () => {
    const loan = file().loans[0];
    expect(missingTrackFields(loan.tracks[0])).toEqual([]);
    expect(missingTrackFields(loan.tracks[1])).toEqual(["anchorSeries"]);
  });

  it("ignores closed tracks however little was read", () => {
    const track = file().loans[0].tracks[2];
    track.linkage = "unknown";
    track.balance.principal = null;
    expect(missingTrackFields(track)).toEqual([]);
  });

  it("lists everything a simulation needs that was not read", () => {
    const track = file().loans[0].tracks[1];
    track.linkage = "unknown";
    track.annualRatePercent = null;
    track.variable = null;
    expect(missingTrackFields(track)).toEqual([
      "linkage",
      "annualRatePercent",
      "marginPercent",
      "nextResetDate",
      "anchorSeries",
    ]);
  });

  it("locates missing fields by track", () => {
    expect(missingLoanFields(file().loans[0])).toEqual([
      { trackIndex: 1, field: "anchorSeries" },
    ]);
  });
});

describe("suggestAnchorSeries", () => {
  it("follows the reset period and linkage", () => {
    const track = file().loans[0].tracks[1]; // CPI-linked, 60-month reset
    expect(suggestAnchorSeries(track)).toBe("governmentBondLinked");
    expect(suggestAnchorSeries({ ...track, linkage: "unlinked" })).toBe("governmentBondUnlinked");
    const yearly = { ...track, linkage: "unlinked" as const, variable: { ...track.variable!, resetFrequencyMonths: 12 } };
    expect(suggestAnchorSeries(yearly)).toBe("makam");
  });

  it("does not guess when the facts are missing", () => {
    const track = file().loans[0].tracks[1];
    expect(suggestAnchorSeries({ ...track, linkage: "unknown" })).toBeNull();
    expect(suggestAnchorSeries({ ...track, variable: null })).toBeNull();
    expect(suggestAnchorSeries(file().loans[0].tracks[0])).toBeNull();
  });
});

describe("withSuggestedAnchors", () => {
  it("fills suggestions without overriding a choice or touching the input", () => {
    const original = file();
    const filled = withSuggestedAnchors(original);
    expect(filled.loans[0].tracks[1].variable?.anchorSeries).toBe("governmentBondLinked");
    expect(original.loans[0].tracks[1].variable?.anchorSeries).toBeUndefined();

    original.loans[0].tracks[1].variable!.anchorSeries = "other";
    expect(withSuggestedAnchors(original).loans[0].tracks[1].variable?.anchorSeries).toBe("other");
  });
});
