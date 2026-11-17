import { describe, expect, it } from "vitest";
import {
  checkMessage,
  fillTemplate,
  formatIsoDate,
  parseNumberInput,
  updateTrackInFile,
} from "../present";
import { parsePayoffReportFile } from "../parse";
import { fictionalTwoLoanFile } from "./fixtures";

describe("fillTemplate", () => {
  it("fills known placeholders and leaves the rest", () => {
    expect(fillTemplate("{a} and {b}", { a: 1 })).toBe("1 and {b}");
  });
});

describe("parseNumberInput", () => {
  it("accepts numbers as people type them", () => {
    expect(parseNumberInput("1,951.19")).toBe(1951.19);
    expect(parseNumberInput(" 4.44% ")).toBe(4.44);
    expect(parseNumberInput("₪60")).toBe(60);
    expect(parseNumberInput("-0.5")).toBe(-0.5);
  });

  it("clears on empty and rejects anything else", () => {
    expect(parseNumberInput("")).toBeNull();
    expect(parseNumberInput("4,4.4.")).toBeUndefined();
    expect(parseNumberInput("abc")).toBeUndefined();
  });
});

describe("formatting", () => {
  it("prints dates the way reports do", () => {
    expect(formatIsoDate("2043-09-01")).toBe("01/09/2043");
    expect(formatIsoDate(null)).toBe("");
  });

  it("fills a check's amounts", () => {
    const message = checkMessage(
      { code: "spitzerPayment", severity: "warning", trackIndex: 0, expected: 2804.02, actual: 2868.01 },
      { spitzerPayment: "{expected} vs {actual}" } as never,
      "en",
    );
    expect(message).toMatch(/2,804\.02 vs .*2,868\.01/);
  });
});

describe("updateTrackInFile", () => {
  it("changes one track and shares everything else", () => {
    const result = parsePayoffReportFile(fictionalTwoLoanFile(), "a.pdf");
    if (!result.ok) throw new Error("fixture must parse");
    const original = result.file;
    const updated = updateTrackInFile(original, 0, 1, (track) => ({ ...track, linkage: "unlinked" }));
    expect(updated.loans[0].tracks[1].linkage).toBe("unlinked");
    expect(original.loans[0].tracks[1].linkage).toBe("cpi");
    expect(updated.loans[0].tracks[0]).toBe(original.loans[0].tracks[0]);
    expect(updated.loans[1]).toBe(original.loans[1]);
  });
});
