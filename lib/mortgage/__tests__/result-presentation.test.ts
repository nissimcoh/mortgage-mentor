import { describe, expect, it } from "vitest";
import { createFallbackForecastCurve } from "../../market-data/mortgage-forecast-fallback";
import { calculateScenarioSummary } from "../calculations";
import { roundMoney } from "../amortization";
import {
  createTrackDraft,
  parseAllTrackDrafts,
  type MarketContextForParsing,
  type TrackDraft,
} from "../scenario-form";
import {
  classifyPaymentPath,
  getForecastFinancingCost,
  PAYMENT_FLAT_TOLERANCE_ILS,
} from "../result-presentation";

const CURVE = createFallbackForecastCurve("2026-07-12T00:00:00Z");
const MARKET: MarketContextForParsing = {
  boiRatePercent: 3.5,
  curves: [CURVE],
  makamSnapshots: [{ id: "2026-06", anchorPercent: 3.2644 }],
};

function fixedDraft(overrides?: Partial<TrackDraft>): TrackDraft {
  return createTrackDraft({
    amount: "800,000",
    ratePercent: "4.8",
    years: "25",
    ...overrides,
  });
}

function fixedLinkedDraft(overrides?: Partial<TrackDraft>): TrackDraft {
  return createTrackDraft({
    trackType: "fixedLinked",
    amount: "500,000",
    years: "20",
    currentRatePercent: "4.5",
    ...overrides,
  });
}

function payments(values: number[]) {
  return values.map((payment) => ({ payment }));
}

describe("classifyPaymentPath — boundary conditions (hand-constructed)", () => {
  it("classifies a schedule that barely varies as flat", () => {
    // Last entry (4581.49) is a settlement-style outlier and is excluded
    // from the comparison — this is the point of the exclusion.
    expect(classifyPaymentPath(payments([4584, 4584, 4584.4, 4581.49]))).toBe(
      "flat",
    );
  });

  it("classifies a schedule whose maximum exceeds its own first payment beyond tolerance as rising", () => {
    expect(classifyPaymentPath(payments([4000, 4200, 4600, 1000]))).toBe(
      "rising",
    );
  });

  it("classifies a schedule that varies but never rises above its first payment as nonRising", () => {
    // Peak in month 1, declining afterward — the equal-principal /
    // multi-track-step-down shape.
    expect(classifyPaymentPath(payments([5000, 4200, 3200, 500]))).toBe(
      "nonRising",
    );
  });

  it("uses the documented ₪1 tolerance at the boundary", () => {
    expect(PAYMENT_FLAT_TOLERANCE_ILS).toBe(1);
    expect(classifyPaymentPath(payments([4000, 4000.5, 4000.9, 1]))).toBe(
      "flat",
    );
    expect(classifyPaymentPath(payments([4000, 4001.5, 3200, 1]))).toBe(
      "rising",
    );
  });

  it("accepts an explicit tolerance override", () => {
    expect(
      classifyPaymentPath(payments([4000, 4003, 3999, 1]), 5),
    ).toBe("flat");
  });

  it("excludes only the final entry from the comparison, not the whole tail", () => {
    // Without exclusion this would read max=5000 vs first=4000 -> "rising";
    // the true (pre-settlement) schedule is flat at 4000, and the final
    // entry is a settlement artifact that must not drive the result.
    expect(classifyPaymentPath(payments([4000, 4000, 4000, 5000]))).toBe(
      "flat",
    );
  });
});

describe("classifyPaymentPath — real engine output", () => {
  it("classifies a single fixed-rate Spitzer scenario as flat, even though its last payment differs from the rest (settlement rounding)", () => {
    const inputs = parseAllTrackDrafts([fixedDraft()], MARKET)!;
    const summary = calculateScenarioSummary({ tracks: inputs });
    // Empirically confirmed: the regular payment and the final
    // (balance-settling) payment are NOT bit-identical here.
    expect(summary.lastPayment).not.toBe(summary.firstPayment);
    expect(classifyPaymentPath(summary.combinedSchedule)).toBe("flat");
  });

  it("classifies an equal-principal scenario as nonRising, not flat — this is exactly the case a naive max-vs-first comparison gets wrong", () => {
    const inputs = parseAllTrackDrafts(
      [fixedDraft({ repaymentMethod: "equalPrincipal" })],
      MARKET,
    )!;
    const summary = calculateScenarioSummary({ tracks: inputs });
    expect(classifyPaymentPath(summary.combinedSchedule)).toBe("nonRising");
    // Sanity: equal-principal genuinely declines (first === max, min well below).
    expect(summary.firstPayment).toBe(summary.maximumPayment);
    expect(summary.minimumPayment).toBeLessThan(summary.firstPayment);
  });
});

describe("getForecastFinancingCost — regression: forecast total paid minus total principal", () => {
  it("holds for a fixedUnlinked scenario", () => {
    const inputs = parseAllTrackDrafts([fixedDraft()], MARKET)!;
    const summary = calculateScenarioSummary({ tracks: inputs });
    const totalPrincipal = inputs.reduce((sum, i) => sum + i.loanAmount, 0);

    expect(getForecastFinancingCost(summary)).toBe(
      roundMoney(summary.totalPayment - totalPrincipal),
    );
  });

  it("holds for a fixedLinked (CPI-linked) scenario, including indexation effects combined with interest", () => {
    const inputs = parseAllTrackDrafts([fixedLinkedDraft()], MARKET)!;
    const summary = calculateScenarioSummary({ tracks: inputs });
    const totalPrincipal = inputs.reduce((sum, i) => sum + i.loanAmount, 0);

    expect(getForecastFinancingCost(summary)).toBe(
      roundMoney(summary.totalPayment - totalPrincipal),
    );
    expect(getForecastFinancingCost(summary)).toBe(summary.totalInterest);
  });

  it("holds for a multi-track mix combining fixedUnlinked and fixedLinked", () => {
    const inputs = parseAllTrackDrafts(
      [fixedDraft(), fixedLinkedDraft()],
      MARKET,
    )!;
    const summary = calculateScenarioSummary({ tracks: inputs });
    const totalPrincipal = inputs.reduce((sum, i) => sum + i.loanAmount, 0);

    expect(getForecastFinancingCost(summary)).toBe(
      roundMoney(summary.totalPayment - totalPrincipal),
    );
  });
});
