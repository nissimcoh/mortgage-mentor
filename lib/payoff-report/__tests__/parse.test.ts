import { describe, expect, it } from "vitest";
import { parsePayoffReportFile } from "../parse";
import { cloneRaw, fictionalTwoLoanFile } from "./fixtures";

function parseOk(raw: unknown) {
  const result = parsePayoffReportFile(raw, "report.pdf");
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result;
}

describe("parsePayoffReportFile", () => {
  it("reads a well-formed file with no issues", () => {
    const { file, issues } = parseOk(fictionalTwoLoanFile());
    expect(issues).toEqual([]);
    expect(file.fileName).toBe("report.pdf");
    expect(file.loans).toHaveLength(2);
    expect(file.loans[0].tracks).toHaveLength(3);
    expect(file.loans[0].tracks[1].variable?.marginPercent).toBe(1.2);
    expect(file.loans[0].tracks[2].status).toBe("closed");
  });

  it("accepts numbers and dates as printed on Israeli reports", () => {
    const raw = cloneRaw(fictionalTwoLoanFile());
    const track = raw.loans[0].tracks[0] as Record<string, unknown>;
    track.monthlyPayment = "1,576.36";
    track.annualRatePercent = "4.80%";
    track.endDate = "01/03/2036";
    const { file, issues } = parseOk(raw);
    expect(issues).toEqual([]);
    expect(file.loans[0].tracks[0].monthlyPayment).toBe(1576.36);
    expect(file.loans[0].tracks[0].annualRatePercent).toBe(4.8);
    expect(file.loans[0].tracks[0].endDate).toBe("2036-03-01");
  });

  it("replaces malformed values with null and reports where", () => {
    const raw = cloneRaw(fictionalTwoLoanFile());
    const track = raw.loans[0].tracks[0] as Record<string, unknown>;
    track.monthlyPayment = "about 1500";
    track.startDate = "2021-02-30";
    track.linkage = "dollar";
    const { file, issues } = parseOk(raw);
    const parsed = file.loans[0].tracks[0];
    expect(parsed.monthlyPayment).toBeNull();
    expect(parsed.startDate).toBeNull();
    expect(parsed.linkage).toBe("unknown");
    expect(issues.map((issue) => issue.path)).toEqual([
      "loans[0].tracks[0].startDate",
      "loans[0].tracks[0].monthlyPayment",
      "loans[0].tracks[0].linkage",
    ]);
  });

  it("treats missing fields as unknown rather than as issues", () => {
    const { file, issues } = parseOk({
      loans: [{ asOfDate: "2026-03-10", tracks: [{ balance: { principal: 1000 } }] }],
    });
    expect(issues).toEqual([]);
    const track = file.loans[0].tracks[0];
    expect(track.balance.principal).toBe(1000);
    expect(track.balance.totalToSettle).toBeNull();
    expect(track.fees.total).toBeNull();
    expect(track.rateType).toBe("unknown");
    expect(track.variable).toBeNull();
  });

  it("infers a closed track from an end date before the report date", () => {
    const { file } = parseOk({
      loans: [
        {
          asOfDate: "2026-03-10",
          tracks: [{ endDate: "2025-06-01" }, { endDate: "2036-03-01" }],
        },
      ],
    });
    expect(file.loans[0].tracks.map((track) => track.status)).toEqual(["closed", "active"]);
  });

  it("drops loans without tracks but keeps the rest", () => {
    const raw = cloneRaw(fictionalTwoLoanFile()) as { loans: unknown[] };
    raw.loans.push({ loanNumber: "x", tracks: [] }, "not a loan");
    const { file, issues } = parseOk(raw);
    expect(file.loans).toHaveLength(2);
    expect(issues.map((issue) => issue.path)).toEqual(["loans[2].tracks", "loans[3]"]);
  });

  it("fails when nothing usable was read", () => {
    expect(parsePayoffReportFile(null, "a.pdf").ok).toBe(false);
    expect(parsePayoffReportFile({ loans: "none" }, "a.pdf").ok).toBe(false);
    expect(parsePayoffReportFile({ loans: [] }, "a.pdf").ok).toBe(false);
  });
});
