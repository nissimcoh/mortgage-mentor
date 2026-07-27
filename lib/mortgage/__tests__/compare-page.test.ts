import { describe, expect, it } from "vitest";
import heDict from "../../../app/[locale]/dictionaries/he.json";
import enDict from "../../../app/[locale]/dictionaries/en.json";

const REQUIRED_KEYS = [
  "intro",
  "scenarioALabel",
  "scenarioBLabel",
  "scenarioNameLabel",
  "scenarioNamePlaceholder",
  "pasteLinkLabel",
  "pasteLinkPlaceholder",
  "loadScenarioButton",
  "orBuildManuallyLabel",
  "compareButton",
  "linkMissingError",
  "linkInvalidError",
  "pinnedDataMissingNote",
  "scenarioLoadedSummary",
  "copyComparisonLinkButton",
  "copyComparisonLinkSuccess",
  "copyComparisonLinkFallback",
  "resultsTitle",
  "metricFirstPayment",
  "metricMaxPayment",
  "metricTotalPayment",
  "metricTotalInterest",
  "metricStability",
  "metricTrackCount",
  "metricPrimeExposure",
  "metricCpiExposure",
  "metricVariableExposure",
  "diffLabel",
  "tableScrollHint",
  "insightsTitle",
  "cheaperSentence",
  "moreStableSentence",
  "lowerFirstHigherMaxSentence",
  "disclaimer",
] as const;

describe("comparePage dictionary", () => {
  it("has every required key, non-empty, in both locales", () => {
    for (const dict of [heDict, enDict]) {
      const c = dict.comparePage as Record<string, string>;
      for (const key of REQUIRED_KEYS) {
        expect(typeof c[key]).toBe("string");
        expect(c[key].length).toBeGreaterThan(0);
      }
    }
  });

  it("no longer carries the old coming-soon body array", () => {
    for (const dict of [heDict, enDict]) {
      expect(
        (dict.comparePage as Record<string, unknown>).body,
      ).toBeUndefined();
    }
  });

  it("has the exact requested Hebrew labels", () => {
    const c = heDict.comparePage;
    expect(c.scenarioALabel).toBe("תרחיש א׳");
    expect(c.scenarioBLabel).toBe("תרחיש ב׳");
    expect(c.scenarioNameLabel).toBe("שם התרחיש");
    expect(c.pasteLinkLabel).toBe("הדבק קישור מהמחשבון");
    expect(c.loadScenarioButton).toBe("טען תרחיש");
    expect(c.orBuildManuallyLabel).toBe("או בנה תרחיש ידנית");
    expect(c.compareButton).toBe("השווה תרחישים");
    expect(c.copyComparisonLinkButton).toBe("העתק קישור להשוואה");
  });

  it("has the exact requested English labels", () => {
    const c = enDict.comparePage;
    expect(c.scenarioALabel).toBe("Scenario A");
    expect(c.scenarioBLabel).toBe("Scenario B");
    expect(c.scenarioNameLabel).toBe("Scenario name");
    expect(c.pasteLinkLabel).toBe("Paste calculator link");
    expect(c.loadScenarioButton).toBe("Load scenario");
    expect(c.orBuildManuallyLabel).toBe("Or build manually");
    expect(c.compareButton).toBe("Compare scenarios");
    expect(c.copyComparisonLinkButton).toBe("Copy comparison link");
  });

  it("has the exact requested metric labels in both locales", () => {
    expect(heDict.comparePage.metricFirstPayment).toBe("החזר ראשון");
    expect(heDict.comparePage.metricMaxPayment).toBe("החזר מרבי");
    expect(heDict.comparePage.metricTotalPayment).toBe("סך תשלומים חזוי");
    expect(heDict.comparePage.metricTotalInterest).toBe(
      "סך ריבית / עלות מימון",
    );
    expect(heDict.comparePage.metricStability).toBe("מדד יציבות");
    expect(heDict.comparePage.metricTrackCount).toBe("מספר מסלולים");
    expect(heDict.comparePage.metricPrimeExposure).toBe("חשיפה לפריים");
    expect(heDict.comparePage.metricCpiExposure).toBe("חשיפה למדד");
    expect(heDict.comparePage.metricVariableExposure).toBe(
      "חשיפה לריבית משתנה",
    );

    expect(enDict.comparePage.metricFirstPayment).toBe("First payment");
    expect(enDict.comparePage.metricMaxPayment).toBe("Highest payment");
    expect(enDict.comparePage.metricTotalPayment).toBe(
      "Forecast total paid",
    );
    expect(enDict.comparePage.metricTotalInterest).toBe(
      "Total interest / financing cost",
    );
    expect(enDict.comparePage.metricStability).toBe("Stability score");
    expect(enDict.comparePage.metricTrackCount).toBe("Number of tracks");
    expect(enDict.comparePage.metricPrimeExposure).toBe("Prime exposure");
    expect(enDict.comparePage.metricCpiExposure).toBe("CPI-linked exposure");
    expect(enDict.comparePage.metricVariableExposure).toBe(
      "Variable-rate exposure",
    );
  });

  it("renders the exact requested example sentences once params are substituted", () => {
    const heCheaper = heDict.comparePage.cheaperSentence
      .replace("{scenario}", "תרחיש ב׳")
      .replace("{amount}", "₪42,000");
    expect(heCheaper).toBe(
      "תרחיש ב׳ זול יותר בכ־₪42,000 בסך התשלומים החזוי לפי המודל.",
    );

    const heStable = heDict.comparePage.moreStableSentence.replace(
      "{scenario}",
      "תרחיש א׳",
    );
    expect(heStable).toBe("תרחיש א׳ יציב יותר לפי מדד היציבות.");

    const heShape = heDict.comparePage.lowerFirstHigherMaxSentence.replace(
      "{scenario}",
      "תרחיש ב׳",
    );
    expect(heShape).toBe(
      "תרחיש ב׳ מתחיל בהחזר נמוך יותר, אך מגיע להחזר מרבי גבוה יותר.",
    );

    const enCheaper = enDict.comparePage.cheaperSentence
      .replace("{scenario}", "Scenario B")
      .replace("{amount}", "₪42,000");
    expect(enCheaper).toBe(
      "Scenario B is about ₪42,000 lower in forecast total paid according to the model.",
    );

    const enStable = enDict.comparePage.moreStableSentence.replace(
      "{scenario}",
      "Scenario A",
    );
    expect(enStable).toBe(
      "Scenario A is more stable according to the stability score.",
    );

    const enShape = enDict.comparePage.lowerFirstHigherMaxSentence.replace(
      "{scenario}",
      "Scenario B",
    );
    expect(enShape).toBe(
      "Scenario B starts with a lower payment but reaches a higher maximum payment.",
    );
  });

  it("has the exact requested disclaimer text", () => {
    expect(heDict.comparePage.disclaimer).toBe(
      "ההשוואה מיועדת ללמידה והשוואה בין תרחישים ואינה ייעוץ משכנתאות.",
    );
    expect(enDict.comparePage.disclaimer).toBe(
      "This comparison is for learning and scenario analysis and is not mortgage advice.",
    );
  });

  it("uses neutral language, never claiming a 'recommended' scenario", () => {
    for (const dict of [heDict, enDict]) {
      const allText = Object.values(dict.comparePage).join(" ").toLowerCase();
      expect(allText).not.toMatch(/recommend/);
      expect(allText).not.toMatch(/מומלץ|מומלצת/);
    }
  });
});
