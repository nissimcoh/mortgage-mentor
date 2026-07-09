import { describe, expect, it } from "vitest";
import { calculateScenarioSummary } from "../index";
import {
  applyTracksToQuery,
  createTrackDraft,
  duplicateTrackDraft,
  parseAllTrackDrafts,
  parseTrackDraft,
  parseTracksFromQuery,
  sumEnteredTrackAmounts,
  type TrackDraft,
} from "../scenario-form";

function validDraft(overrides?: Partial<TrackDraft>): TrackDraft {
  return createTrackDraft({
    amount: "800,000",
    ratePercent: "4.8",
    years: "25",
    ...overrides,
  });
}

describe("track draft parsing", () => {
  it("converts one valid draft to an engine input without the UI id", () => {
    const input = parseTrackDraft(validDraft());
    expect(input).toEqual({
      type: "fixedUnlinked",
      repaymentMethod: "spitzer",
      loanAmount: 800_000,
      annualInterestRatePercent: 4.8,
      interestRateInputMode: "nominalAnnual",
      years: 25,
    });
    expect(input).not.toHaveProperty("id");
  });

  it("parses two valid drafts", () => {
    const inputs = parseAllTrackDrafts([
      validDraft(),
      validDraft({ amount: "400000", ratePercent: "3,9", years: "10" }),
    ]);
    expect(inputs).toHaveLength(2);
    expect(inputs![1].loanAmount).toBe(400_000);
    expect(inputs![1].annualInterestRatePercent).toBe(3.9);
  });

  it("rejects an empty track", () => {
    expect(parseTrackDraft(createTrackDraft())).toBeNull();
    expect(parseAllTrackDrafts([validDraft(), createTrackDraft()])).toBeNull();
  });

  it("rejects zero amounts and out-of-range durations", () => {
    expect(parseTrackDraft(validDraft({ amount: "0" }))).toBeNull();
    expect(parseTrackDraft(validDraft({ years: "31" }))).toBeNull();
    expect(parseTrackDraft(validDraft({ years: "0" }))).toBeNull();
  });

  it("sums only the amounts that currently parse", () => {
    const drafts = [
      validDraft(),
      validDraft({ amount: "400,000" }),
      validDraft({ amount: "not-a-number" }),
      createTrackDraft(),
    ];
    expect(sumEnteredTrackAmounts(drafts)).toBe(1_200_000);
  });

  it("duplicates a track with the same values but a distinct id", () => {
    const original = validDraft();
    const copy = duplicateTrackDraft(original);
    expect(copy.id).not.toBe(original.id);
    const { id: _a, ...originalValues } = original;
    const { id: _b, ...copyValues } = copy;
    expect(copyValues).toEqual(originalValues);
  });
});

describe("URL serialization", () => {
  it("serializes two tracks into readable indexed params", () => {
    const query = applyTracksToQuery(new URLSearchParams(), [
      validDraft(),
      validDraft({ amount: "400,000", ratePercent: "3.9", years: "10" }),
    ]);
    expect(query.get("trackCount")).toBe("2");
    expect(query.get("track1Amount")).toBe("800000");
    expect(query.get("track1AnnualInterestRatePercent")).toBe("4.8");
    expect(query.get("track1Years")).toBe("25");
    expect(query.get("track1Type")).toBe("fixedUnlinked");
    expect(query.get("track1RepaymentMethod")).toBe("spitzer");
    expect(query.get("track2Amount")).toBe("400000");
    expect(query.get("track2Years")).toBe("10");
  });

  it("removes stale indexed params when the track count shrinks", () => {
    const query = applyTracksToQuery(new URLSearchParams(), [
      validDraft(),
      validDraft({ amount: "400000" }),
    ]);
    applyTracksToQuery(query, [validDraft({ amount: "500,000" })]);
    expect(query.get("trackCount")).toBe("1");
    expect(query.get("track1Amount")).toBe("500000");
    expect(query.get("track2Amount")).toBeNull();
    expect(query.get("track2Type")).toBeNull();
    expect(query.get("track2RepaymentMethod")).toBeNull();
  });

  it("round-trips an equal-principal track through the URL", () => {
    const query = applyTracksToQuery(new URLSearchParams(), [
      validDraft({ repaymentMethod: "equalPrincipal" }),
    ]);
    expect(query.get("track1RepaymentMethod")).toBe("equalPrincipal");

    const drafts = parseTracksFromQuery(query);
    expect(drafts![0].repaymentMethod).toBe("equalPrincipal");
    expect(parseTrackDraft(drafts![0])!.repaymentMethod).toBe(
      "equalPrincipal",
    );
  });

  it("replaces legacy single-track params with the indexed format", () => {
    const query = new URLSearchParams(
      "loanAmount=800000&annualInterestRatePercent=4.8&years=25&trackType=fixedUnlinked&repaymentMethod=spitzer&unrelated=1",
    );
    applyTracksToQuery(query, [validDraft()]);
    expect(query.get("loanAmount")).toBeNull();
    expect(query.get("years")).toBeNull();
    expect(query.get("track1Amount")).toBe("800000");
    // Non-track params (e.g. future ones) survive.
    expect(query.get("unrelated")).toBe("1");
  });
});

describe("URL parsing", () => {
  it("parses two indexed tracks", () => {
    const query = new URLSearchParams(
      "trackCount=2&track1Amount=800000&track1AnnualInterestRatePercent=4.8&track1Years=25&track1Type=fixedUnlinked&track1RepaymentMethod=spitzer&track2Amount=400000&track2AnnualInterestRatePercent=3.9&track2Years=10&track2Type=fixedUnlinked&track2RepaymentMethod=spitzer",
    );
    const drafts = parseTracksFromQuery(query);
    expect(drafts).toHaveLength(2);
    expect(drafts![0].amount).toBe("800,000");
    expect(drafts![1].years).toBe("10");
    expect(drafts![0].id).not.toBe(drafts![1].id);
    expect(parseAllTrackDrafts(drafts!)).toHaveLength(2);
  });

  it("parses the legacy single-track format", () => {
    const query = new URLSearchParams(
      "loanAmount=800000&annualInterestRatePercent=4.8&years=25&trackType=fixedUnlinked&repaymentMethod=spitzer",
    );
    const drafts = parseTracksFromQuery(query);
    expect(drafts).toHaveLength(1);
    expect(drafts![0].amount).toBe("800,000");
    expect(drafts![0].ratePercent).toBe("4.8");
    expect(drafts![0].years).toBe("25");
  });

  it("accepts equalPrincipal in indexed and legacy URLs", () => {
    const indexed = parseTracksFromQuery(
      new URLSearchParams(
        "trackCount=1&track1Amount=800000&track1AnnualInterestRatePercent=4.8&track1Years=25&track1Type=fixedUnlinked&track1RepaymentMethod=equalPrincipal",
      ),
    );
    expect(indexed![0].repaymentMethod).toBe("equalPrincipal");

    const legacy = parseTracksFromQuery(
      new URLSearchParams(
        "loanAmount=800000&annualInterestRatePercent=4.8&years=25&trackType=fixedUnlinked&repaymentMethod=equalPrincipal",
      ),
    );
    expect(legacy![0].repaymentMethod).toBe("equalPrincipal");
  });

  it("falls back safely on invalid or unsupported values", () => {
    expect(parseTracksFromQuery(new URLSearchParams())).toBeNull();

    const junk = parseTracksFromQuery(
      new URLSearchParams(
        "trackCount=99&track1Amount=abc&track1Years=99&track1Type=prime&track1RepaymentMethod=balloon",
      ),
    );
    expect(junk).toHaveLength(1);
    expect(junk![0].amount).toBe("abc"); // kept for the user to fix
    expect(junk![0].years).toBe(""); // out of range → placeholder
    expect(junk![0].trackType).toBe("fixedUnlinked");
    expect(junk![0].repaymentMethod).toBe("spitzer");
  });

  it("caps the number of parsed tracks at the maximum", () => {
    const params = new URLSearchParams("trackCount=9");
    for (let index = 1; index <= 9; index++) {
      params.set(`track${index}Amount`, "100000");
    }
    expect(parseTracksFromQuery(params)).toHaveLength(5);
  });
});

describe("scenario integration", () => {
  it("combines a 10-year and a 25-year track; payment drops when the short one ends", () => {
    const inputs = parseAllTrackDrafts([
      validDraft(), // 800k @ 4.8% for 25y
      validDraft({ amount: "400,000", ratePercent: "3.9", years: "10" }),
    ])!;
    const summary = calculateScenarioSummary({ tracks: inputs });

    expect(summary.numberOfPayments).toBe(300);
    expect(summary.finalBalance).toBe(0);
    // Total mortgage equals the sum of track amounts.
    expect(
      inputs.reduce((sum, input) => sum + input.loanAmount, 0),
    ).toBe(1_200_000);
    // Month 121 (after the 10-year track ends) costs less than month 120.
    expect(summary.combinedSchedule[120].payment).toBeLessThan(
      summary.combinedSchedule[119].payment,
    );
    // From then on, only the long track is paying.
    expect(summary.combinedSchedule[120].payment).toBeCloseTo(
      summary.trackSummaries[0].schedule[120].payment,
      2,
    );
  });
});
