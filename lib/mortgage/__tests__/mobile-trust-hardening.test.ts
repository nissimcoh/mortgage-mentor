import { describe, expect, it } from "vitest";
import heDict from "../../../app/[locale]/dictionaries/he.json";
import enDict from "../../../app/[locale]/dictionaries/en.json";

describe("share-scenario-link dictionary keys", () => {
  it("exist, are non-empty, and are distinct in both locales", () => {
    for (const dict of [heDict, enDict]) {
      const c = dict.calculator;
      const values = [
        c.copyScenarioLinkButton,
        c.copyScenarioLinkSuccess,
        c.copyScenarioLinkFallback,
      ];
      for (const value of values) {
        expect(typeof value).toBe("string");
        expect(value.length).toBeGreaterThan(0);
      }
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("has the exact requested copy", () => {
    expect(heDict.calculator.copyScenarioLinkButton).toBe(
      "העתק קישור לתרחיש",
    );
    expect(heDict.calculator.copyScenarioLinkSuccess).toBe("הקישור הועתק");
    expect(enDict.calculator.copyScenarioLinkButton).toBe(
      "Copy scenario link",
    );
    expect(enDict.calculator.copyScenarioLinkSuccess).toBe("Link copied");
  });
});

describe("jump-to-results dictionary key", () => {
  it("exists and is non-empty in both locales", () => {
    expect(heDict.calculator.viewResultsButton.length).toBeGreaterThan(0);
    expect(enDict.calculator.viewResultsButton.length).toBeGreaterThan(0);
  });
});

describe("amortization table scroll hint", () => {
  it("exists in both locales with the requested copy", () => {
    expect(heDict.calculator.scheduleScrollHint).toBe(
      "ניתן לגלול את הטבלה הצידה כדי לראות קרן, ריבית ויתרה.",
    );
    expect(enDict.calculator.scheduleScrollHint).toBe(
      "Scroll sideways to see principal, interest, and balance.",
    );
  });
});

describe("field-level validation message dictionary keys", () => {
  const CODES = [
    "fieldErrorAmountInvalid",
    "fieldErrorYearsInvalid",
    "fieldErrorYearsInvalidForReset",
    "fieldErrorResetPeriodInvalid",
    "fieldErrorRateInvalid",
  ] as const;

  it("exist, are non-empty, and are mutually distinct in both locales", () => {
    for (const dict of [heDict, enDict]) {
      const c = dict.calculator as Record<string, string>;
      const values = CODES.map((code) => c[code]);
      for (const value of values) {
        expect(typeof value).toBe("string");
        expect(value.length).toBeGreaterThan(0);
      }
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("has the exact requested Hebrew/English copy for the given examples", () => {
    expect(heDict.calculator.fieldErrorAmountInvalid).toBe(
      "הזן סכום הלוואה תקין",
    );
    expect(heDict.calculator.fieldErrorYearsInvalid).toBe("בחר תקופה תקינה");
    expect(heDict.calculator.fieldErrorRateInvalid).toBe(
      "הזן ריבית שנתית תקינה",
    );
    expect(heDict.calculator.fieldErrorYearsInvalidForReset).toBe(
      "התקופה שנבחרה לא מתאימה לתדירות שינוי הריבית",
    );

    expect(enDict.calculator.fieldErrorAmountInvalid).toBe(
      "Enter a valid loan amount",
    );
    expect(enDict.calculator.fieldErrorYearsInvalid).toBe(
      "Select a valid term",
    );
    expect(enDict.calculator.fieldErrorRateInvalid).toBe(
      "Enter a valid annual rate",
    );
    expect(enDict.calculator.fieldErrorYearsInvalidForReset).toBe(
      "This term is not available for the selected reset frequency",
    );
  });
});

describe("freshness section intro and technical-details disclosure", () => {
  it("adds an intro sentence and a technical-details label in both locales", () => {
    for (const dict of [heDict, enDict]) {
      expect(dict.calculator.freshnessIntro.length).toBeGreaterThan(0);
      expect(
        dict.calculator.freshnessTechnicalDetails.length,
      ).toBeGreaterThan(0);
    }
  });

  it("no longer has the old always-visible generic curve label", () => {
    for (const dict of [heDict, enDict]) {
      expect(
        (dict.calculator as Record<string, unknown>).freshnessCurve,
      ).toBeUndefined();
    }
  });
});

describe("copy simplification: no numeric weights or clamp jargon in user-facing text", () => {
  it("stability help no longer exposes internal percentage weights", () => {
    for (const dict of [heDict, enDict]) {
      const text = dict.calculator.stabilityDimensionsHelp;
      expect(text).not.toMatch(/%/);
      expect(text).not.toMatch(/45|35|20/);
    }
  });

  it("negative-rate note reads as a plain stress-scenario disclaimer", () => {
    for (const dict of [heDict, enDict]) {
      const text = dict.calculator.negativeRatesNote;
      expect(text).not.toMatch(/0%/);
      expect(text.length).toBeGreaterThan(0);
    }
    expect(heDict.calculator.negativeRatesNote).toBe(
      "זהו תרחיש קיצון לבדיקת עמידות, לא תחזית סבירה.",
    );
    expect(enDict.calculator.negativeRatesNote).toBe(
      "This is a stress scenario, not a likely forecast.",
    );
  });

  it("effective-rate help is shortened", () => {
    expect(heDict.calculator.effectiveRateHelp).toBe(
      "ריבית שנתית בפועל, בהתחשב בגבייה החודשית.",
    );
    expect(enDict.calculator.effectiveRateHelp).toBe(
      "The effective annual rate after accounting for monthly compounding.",
    );
  });

  it("prime margin label explains what the margin is relative to", () => {
    expect(heDict.calculator.primeInfoMargin).toContain("פריים");
    expect(enDict.calculator.primeInfoMargin.toLowerCase()).toContain(
      "prime",
    );
  });
});
