import { describe, expect, it } from "vitest";
import { calculateScenarioSummary } from "@/lib/mortgage";
import { parseTracksFromQuery } from "@/lib/mortgage/scenario-form";
import { buildLoanStory, loanPointAt, loanStoryCalculatorHref, LOAN_STORY_LIMITS } from "../loan-story";

const CASES: [number, number, number][] = [
  [1_000_000, 5, 30],
  [800_000, 4.8, 25],
  [200_000, 2, 5],
  [3_000_000, 8, 30],
  [1_250_000, 3.7, 17],
];

describe("buildLoanStory", () => {
  it.each(CASES)("matches the calculator engine for %i at %f%% over %i years", (loanAmount, rate, years) => {
    const story = buildLoanStory(loanAmount, rate, years);
    const engine = calculateScenarioSummary({
      tracks: [{ type: "fixedUnlinked", repaymentMethod: "spitzer", loanAmount, annualInterestRatePercent: rate, years }],
    });
    expect(story.monthlyPayment).toBe(engine.monthlyPayment);
    expect(story.totalPaid).toBe(engine.totalPayment);
    expect(story.totalInterest).toBe(engine.totalInterest);
    expect(story.points).toHaveLength(years + 1);
    expect(story.points[0].balance).toBe(loanAmount);
    expect(story.points[years].balance).toBe(0);
    expect(story.points[years].principalPaid).toBeCloseTo(loanAmount, 0);
    expect(story.points[years].interestPaid).toBeCloseTo(engine.totalInterest, 0);
    // The year-end balance is the engine's balance for that month.
    expect(story.points[1].balance).toBe(engine.combinedSchedule[11].remainingBalance);
  });

  it("reports the first month in which principal exceeds interest", () => {
    const story = buildLoanStory(1_000_000, 5, 30);
    const engine = calculateScenarioSummary({
      tracks: [{ type: "fixedUnlinked", repaymentMethod: "spitzer", loanAmount: 1_000_000, annualInterestRatePercent: 5, years: 30 }],
    });
    const expected = engine.combinedSchedule.find((entry) => entry.principalPayment > entry.interestPayment)!.month;
    expect(story.crossoverMonth).toBe(expected);
    expect(story.crossoverMonth).toBeGreaterThan(12);
    // A short, cheap loan repays mostly principal from the first payment.
    expect(buildLoanStory(200_000, 2, 5).crossoverMonth).toBe(1);
  });

  it("has a falling balance and a falling interest share", () => {
    const { points } = buildLoanStory(1_000_000, 5, 30);
    for (let index = 1; index < points.length; index++) {
      expect(points[index].balance).toBeLessThan(points[index - 1].balance);
      expect(points[index].interestShare).toBeLessThanOrEqual(points[index - 1].interestShare);
    }
    expect(points[0].interestShare).toBeGreaterThan(0.7);
  });
});

describe("loanPointAt", () => {
  const story = buildLoanStory(1_000_000, 5, 30);
  it("returns exact points on year boundaries and clamps outside the term", () => {
    expect(loanPointAt(story, 10).balance).toBe(story.points[10].balance);
    expect(loanPointAt(story, -3).balance).toBe(1_000_000);
    expect(loanPointAt(story, 99).balance).toBe(0);
  });
  it("interpolates between year boundaries", () => {
    const mid = loanPointAt(story, 10.5).balance;
    expect(mid).toBeLessThan(story.points[10].balance);
    expect(mid).toBeGreaterThan(story.points[11].balance);
  });
});

describe("loanStoryCalculatorHref", () => {
  it("round-trips through the calculator's own URL parser", () => {
    const href = loanStoryCalculatorHref("he", { loanAmount: 1_250_000, annualRatePercent: 4.7, years: 22 });
    expect(href.startsWith("/he/calculator?")).toBe(true);
    const drafts = parseTracksFromQuery(new URLSearchParams(href.split("?")[1]));
    expect(drafts).toHaveLength(1);
    expect(drafts![0].trackType).toBe("fixedUnlinked");
    expect(drafts![0].repaymentMethod).toBe("spitzer");
    expect(drafts![0].amount.replace(/\D/g, "")).toBe("1250000");
    expect(drafts![0].years).toBe("22");
    expect(Number(drafts![0].ratePercent)).toBe(4.7);
  });

  it("keeps every slider stop inside the calculator's accepted ranges", () => {
    expect(LOAN_STORY_LIMITS.years.max).toBeLessThanOrEqual(30);
    expect(LOAN_STORY_LIMITS.years.min).toBeGreaterThanOrEqual(1);
    expect(LOAN_STORY_LIMITS.rate.min).toBeGreaterThanOrEqual(0);
  });
});
