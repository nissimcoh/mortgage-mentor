import { describe, expect, it } from "vitest";
import {
  classifyCurveFreshnessRole,
  createTrackDraft,
  type MarketContextForParsing,
} from "../scenario-form";
import { createFallbackForecastCurve } from "../../market-data/mortgage-forecast-fallback";
import { freshnessStatusText } from "../../forms/freshness";
import heDict from "../../../app/[locale]/dictionaries/he.json";
import enDict from "../../../app/[locale]/dictionaries/en.json";

const LATEST_CURVE = createFallbackForecastCurve("2026-07-12T00:00:00Z");
const HISTORICAL_CURVE = {
  ...LATEST_CURVE,
  id: "2026-05-calendar",
  referenceMonth: 5,
  publicationDate: "2026-06-02",
};
const MARKET: MarketContextForParsing = {
  boiRatePercent: 3.5,
  curves: [LATEST_CURVE, HISTORICAL_CURVE],
  makamSnapshots: [],
};

describe("classifyCurveFreshnessRole", () => {
  it("labels the default (unpinned) curve as latest when no track uses it", () => {
    const drafts = [createTrackDraft({ trackType: "fixedUnlinked" })];
    expect(
      classifyCurveFreshnessRole(LATEST_CURVE.id, 0, drafts, MARKET),
    ).toBe("latest");
  });

  it("labels the default curve as used once a variable-style track resolves to it", () => {
    const drafts = [
      createTrackDraft({ trackType: "prime", forecastCurveId: "" }),
    ];
    expect(
      classifyCurveFreshnessRole(LATEST_CURVE.id, 0, drafts, MARKET),
    ).toBe("used");
  });

  it("labels a historical curve as used when a track pins it", () => {
    const drafts = [
      createTrackDraft({
        trackType: "variableGovernmentBond",
        forecastCurveId: HISTORICAL_CURVE.id,
      }),
    ];
    expect(
      classifyCurveFreshnessRole(HISTORICAL_CURVE.id, 1, drafts, MARKET),
    ).toBe("used");
  });

  it("labels a historical curve as pinned-only when no current track resolves to it", () => {
    const drafts = [createTrackDraft({ trackType: "fixedUnlinked" })];
    expect(
      classifyCurveFreshnessRole(HISTORICAL_CURVE.id, 1, drafts, MARKET),
    ).toBe("pinned");
  });

  it("never counts a non-variable-style track's curve field as 'used'", () => {
    // fixedUnlinked doesn't consume curve data at all; even if its
    // forecastCurveId happened to equal a curve's id, that must not make
    // the curve count as used by the current calculation.
    const drafts = [
      createTrackDraft({
        trackType: "fixedUnlinked",
        forecastCurveId: LATEST_CURVE.id,
      }),
    ];
    expect(
      classifyCurveFreshnessRole(LATEST_CURVE.id, 0, drafts, MARKET),
    ).toBe("latest");
  });

  it("gives two curves in the same scenario distinguishable roles, never both 'latest'/generic", () => {
    const drafts = [
      createTrackDraft({
        trackType: "fixedLinked",
        forecastCurveId: HISTORICAL_CURVE.id,
      }),
    ];
    const latestRole = classifyCurveFreshnessRole(
      LATEST_CURVE.id,
      0,
      drafts,
      MARKET,
    );
    const historicalRole = classifyCurveFreshnessRole(
      HISTORICAL_CURVE.id,
      1,
      drafts,
      MARKET,
    );
    expect(latestRole).not.toBe(historicalRole);
    expect(historicalRole).toBe("used");
    expect(latestRole).toBe("latest");
  });
});

describe("freshnessStatusText", () => {
  const labels = {
    freshnessStatusLive: heDict.calculator.freshnessStatusLive,
    freshnessStatusFallback: heDict.calculator.freshnessStatusFallback,
  };

  it("never labels fallback data as live", () => {
    expect(freshnessStatusText("fallback", labels)).toBe(
      labels.freshnessStatusFallback,
    );
    expect(freshnessStatusText("fallback", labels)).not.toBe(
      labels.freshnessStatusLive,
    );
  });

  it("labels live data as live", () => {
    expect(freshnessStatusText("live", labels)).toBe(labels.freshnessStatusLive);
  });
});

describe("freshness dictionary labels", () => {
  it("gives every curve role a distinct, non-empty label in both locales", () => {
    for (const dict of [heDict, enDict]) {
      const roles = [
        dict.calculator.freshnessCurveUsed,
        dict.calculator.freshnessCurveLatest,
        dict.calculator.freshnessCurvePinned,
      ];
      expect(new Set(roles).size).toBe(roles.length);
      for (const label of roles) expect(label.length).toBeGreaterThan(0);
    }
  });

  it("separates reference/publication/effective/checked into distinct labels", () => {
    for (const dict of [heDict, enDict]) {
      const c = dict.calculator;
      const labels = [
        c.freshnessReference,
        c.freshnessPublished,
        c.freshnessEffective,
        c.freshnessChecked,
        c.freshnessNextDecision,
      ];
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it("localizes average type as calendar-average / index-month average", () => {
    expect(heDict.calculator.averageCalendar).toBe("ממוצע קלנדרי");
    expect(heDict.calculator.averageIndex).toBe("ממוצע מדדי");
    expect(enDict.calculator.averageCalendar).toBe("calendar average");
    expect(enDict.calculator.averageIndex).toBe("index-month average");
  });

  it("renders correct English labels for the freshness section", () => {
    const c = enDict.calculator;
    expect(c.freshnessCurveUsed).toBe("Curve used in this calculation");
    expect(c.freshnessCurveLatest).toBe("Latest available curve");
    expect(c.freshnessCurvePinned).toBe("Curve pinned in the link");
    expect(c.freshnessChecked).toBe("Last checked");
    expect(c.freshnessNextDecision).toBe("Next decision");
    expect(c.freshnessStatusLabel).toBe("Status");
  });

  it("has no leftover generic 'forecast curve' label to accidentally reuse", () => {
    expect((heDict.calculator as Record<string, unknown>).freshnessCurve).toBeUndefined();
    expect((enDict.calculator as Record<string, unknown>).freshnessCurve).toBeUndefined();
  });
});
