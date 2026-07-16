import { describe, expect, it } from "vitest";
import {
  calculateStabilityScore,
  combinedStabilityScore,
  stabilityColorState,
  stabilityLevel,
  TRACK_STABILITY_ARCHETYPES,
  trackStabilityScore,
} from "../stability";

describe("track archetype scores", () => {
  it("scores every archetype per the weighted formula", () => {
    expect(trackStabilityScore("fixedUnlinked")).toBe(100);
    expect(trackStabilityScore("prime")).toBe(64); // 18 + 35 + 11
    expect(trackStabilityScore("variableUnlinked")).toBeCloseTo(59.75, 10);
    expect(trackStabilityScore("fixedLinked")).toBeCloseTo(62.75, 10);
    expect(trackStabilityScore("variableLinked")).toBeCloseTo(22.25, 10);
  });

  it("rounded display values match the documented approximations", () => {
    expect(Math.round(trackStabilityScore("fixedUnlinked"))).toBe(100);
    expect(Math.round(trackStabilityScore("prime"))).toBe(64);
    expect(Math.round(trackStabilityScore("variableUnlinked"))).toBe(60);
    expect(Math.round(trackStabilityScore("fixedLinked"))).toBe(63);
    expect(Math.round(trackStabilityScore("variableLinked"))).toBe(22);
  });

  it("keeps the pure calculation unrounded", () => {
    expect(
      calculateStabilityScore(TRACK_STABILITY_ARCHETYPES.variableUnlinked),
    ).not.toBe(60);
  });
});

describe("stability labels", () => {
  it("maps every threshold boundary", () => {
    expect(stabilityLevel(100)).toBe("veryHigh");
    expect(stabilityLevel(90)).toBe("veryHigh");
    expect(stabilityLevel(89.99)).toBe("high");
    expect(stabilityLevel(70)).toBe("high");
    expect(stabilityLevel(69.99)).toBe("medium");
    expect(stabilityLevel(50)).toBe("medium");
    expect(stabilityLevel(49.99)).toBe("low");
    expect(stabilityLevel(30)).toBe("low");
    expect(stabilityLevel(29.99)).toBe("veryLow");
    expect(stabilityLevel(0)).toBe("veryLow");
  });
});

describe("stability color states", () => {
  it("maps the exact semantic thresholds", () => {
    expect(stabilityColorState(70)).toBe("stable");
    expect(stabilityColorState(69.99)).toBe("moderate");
    expect(stabilityColorState(50)).toBe("moderate");
    expect(stabilityColorState(49.99)).toBe("unstable");
    expect(stabilityColorState(100)).toBe("stable");
    expect(stabilityColorState(0)).toBe("unstable");
  });

  it("variableUnlinked lands in the amber/moderate band at 60/100", () => {
    const score = trackStabilityScore("variableUnlinked");
    expect(Math.round(score)).toBe(60);
    expect(stabilityColorState(score)).toBe("moderate");
  });
});

describe("combined mortgage stability", () => {
  it("averages a 50/50 fixedUnlinked + prime mix", () => {
    expect(
      combinedStabilityScore([
        { trackType: "fixedUnlinked", loanAmount: 500_000 },
        { trackType: "prime", loanAmount: 500_000 },
      ]),
    ).toBe(82); // (100 + 64) / 2
  });

  it("weights by original requested amounts", () => {
    expect(
      combinedStabilityScore([
        { trackType: "fixedUnlinked", loanAmount: 300_000 },
        { trackType: "prime", loanAmount: 100_000 },
      ]),
    ).toBe(91); // (300k·100 + 100k·64) / 400k
  });

  it("rejects a zero or empty total", () => {
    expect(() => combinedStabilityScore([])).toThrow(/positive amount/);
    expect(() =>
      combinedStabilityScore([{ trackType: "prime", loanAmount: 0 }]),
    ).toThrow(/positive amount/);
  });
});
