import { describe, expect, it } from "vitest";
import {
  buildScenarioQueryString,
  extractScenarioQueryParams,
  parsePastedCalculatorLink,
} from "../scenario-url";
import { createTrackDraft, parseTracksFromQuery } from "../scenario-form";

describe("parsePastedCalculatorLink", () => {
  it("parses a full calculator URL from this app", () => {
    const params = parsePastedCalculatorLink(
      "https://mortgagementor.example/he/calculator?trackCount=1&track1Amount=500000&track1Type=fixedUnlinked&track1RepaymentMethod=spitzer&track1Years=20&track1AnnualInterestRatePercent=4.5",
    );
    expect(params).not.toBeNull();
    expect(params!.get("trackCount")).toBe("1");
    expect(params!.get("track1Amount")).toBe("500000");
  });

  it("parses a bare query string, with or without a leading '?'", () => {
    const withoutQuestion = parsePastedCalculatorLink(
      "trackCount=1&track1Amount=500000",
    );
    const withQuestion = parsePastedCalculatorLink(
      "?trackCount=1&track1Amount=500000",
    );
    expect(withoutQuestion!.get("track1Amount")).toBe("500000");
    expect(withQuestion!.get("track1Amount")).toBe("500000");
  });

  it("accepts a URL from an unrelated origin — only the query params matter", () => {
    const params = parsePastedCalculatorLink(
      "https://example.com/some/other/path?trackCount=1&track1Amount=800000&track1Type=fixedUnlinked&track1RepaymentMethod=spitzer&track1Years=10&track1AnnualInterestRatePercent=3",
    );
    expect(params!.get("track1Amount")).toBe("800000");
    const drafts = parseTracksFromQuery(params!);
    expect(drafts).not.toBeNull();
    expect(drafts![0].amount).toBe("800,000");
  });

  it("supports legacy single-track calculator params end to end", () => {
    const params = parsePastedCalculatorLink(
      "loanAmount=800000&annualInterestRatePercent=4.8&years=25",
    );
    const drafts = parseTracksFromQuery(params!);
    expect(drafts).not.toBeNull();
    expect(drafts).toHaveLength(1);
    expect(drafts![0].amount).toBe("800,000");
    expect(drafts![0].ratePercent).toBe("4.8");
  });

  it("returns null for empty or whitespace-only input", () => {
    expect(parsePastedCalculatorLink("")).toBeNull();
    expect(parsePastedCalculatorLink("   ")).toBeNull();
  });

  it("does not itself reject garbage text, but the downstream parser does", () => {
    const params = parsePastedCalculatorLink("hello world, not a link");
    expect(params).not.toBeNull();
    // No recognizable track/legacy keys in there -> the real validity check.
    expect(parseTracksFromQuery(params!)).toBeNull();
  });
});

describe("extractScenarioQueryParams", () => {
  it("strips the prefix and lowercases the first letter", () => {
    const params = new URLSearchParams(
      "aTrackCount=1&aTrack1Amount=500000&aTrack1Type=fixedUnlinked",
    );
    const scoped = extractScenarioQueryParams(params, "a");
    expect(scoped.get("trackCount")).toBe("1");
    expect(scoped.get("track1Amount")).toBe("500000");
    expect(scoped.get("track1Type")).toBe("fixedUnlinked");
  });

  it("never lets the other scenario's params bleed through", () => {
    const params = new URLSearchParams(
      "aTrackCount=1&aTrack1Amount=500000&bTrackCount=1&bTrack1Amount=800000",
    );
    const a = extractScenarioQueryParams(params, "a");
    const b = extractScenarioQueryParams(params, "b");
    expect(a.get("track1Amount")).toBe("500000");
    expect(b.get("track1Amount")).toBe("800000");
    // Each side only has its own two keys — nothing from the other side.
    expect([...a.keys()].sort()).toEqual(["track1Amount", "trackCount"]);
    expect([...b.keys()].sort()).toEqual(["track1Amount", "trackCount"]);
  });

  it("ignores keys that merely start with the prefix letter but aren't prefixed-shaped", () => {
    // A hypothetical unrelated lowercase-continuation key must not match.
    const params = new URLSearchParams("aardvark=1&aTrackCount=2");
    const scoped = extractScenarioQueryParams(params, "a");
    expect(scoped.get("trackCount")).toBe("2");
    expect(scoped.has("ardvark")).toBe(false);
  });
});

describe("buildScenarioQueryString", () => {
  it("round-trips through extractScenarioQueryParams back to an equivalent draft", () => {
    const draft = createTrackDraft({
      amount: "500,000",
      ratePercent: "4.8",
      years: "20",
      trackType: "fixedUnlinked",
      repaymentMethod: "spitzer",
    });
    const built = buildScenarioQueryString([draft], "a");
    expect(built).toContain("aTrackCount=1");
    expect(built).toContain("aTrack1Amount=500000");

    const scoped = extractScenarioQueryParams(new URLSearchParams(built), "a");
    const roundTripped = parseTracksFromQuery(scoped);
    expect(roundTripped).not.toBeNull();
    expect(roundTripped![0].amount).toBe("500,000");
    expect(roundTripped![0].ratePercent).toBe("4.8");
    expect(roundTripped![0].years).toBe("20");
  });

  it("keeps two scenarios independent when merged into one query string", () => {
    const draftA = createTrackDraft({
      amount: "500,000",
      ratePercent: "4.8",
      years: "20",
    });
    const draftB = createTrackDraft({
      amount: "800,000",
      trackType: "prime",
      currentRatePercent: "4.5",
      years: "25",
    });
    const merged = new URLSearchParams(
      `${buildScenarioQueryString([draftA], "a")}&${buildScenarioQueryString([draftB], "b")}`,
    );

    const draftsA = parseTracksFromQuery(
      extractScenarioQueryParams(merged, "a"),
    );
    const draftsB = parseTracksFromQuery(
      extractScenarioQueryParams(merged, "b"),
    );
    expect(draftsA![0].amount).toBe("500,000");
    expect(draftsA![0].trackType).toBe("fixedUnlinked");
    expect(draftsB![0].amount).toBe("800,000");
    expect(draftsB![0].trackType).toBe("prime");
  });
});
