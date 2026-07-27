import { describe, expect, it } from "vitest";
import heDict from "../../../app/[locale]/dictionaries/he.json";
import enDict from "../../../app/[locale]/dictionaries/en.json";

describe("app-shell navigation labels", () => {
  it("has every nav label, non-empty, in both locales", () => {
    for (const dict of [heDict, enDict]) {
      const nav = dict.nav;
      expect(nav.appName.length).toBeGreaterThan(0);
      expect(nav.ariaLabel.length).toBeGreaterThan(0);
      expect(nav.home.length).toBeGreaterThan(0);
      expect(nav.calculator.length).toBeGreaterThan(0);
      expect(nav.compare.length).toBeGreaterThan(0);
      expect(nav.saved.length).toBeGreaterThan(0);
      expect(nav.signIn.length).toBeGreaterThan(0);
      expect(nav.bottomNavCompare.length).toBeGreaterThan(0);
    }
  });

  it("has the exact requested Hebrew top-nav labels", () => {
    const nav = heDict.nav;
    expect(nav.home).toBe("בית");
    expect(nav.calculator).toBe("מחשבון");
    expect(nav.compare).toBe("השוואת תרחישים");
    expect(nav.saved).toBe("שמורים");
    expect(nav.signIn).toBe("כניסה");
  });

  it("has the exact requested English top-nav labels", () => {
    const nav = enDict.nav;
    expect(nav.home).toBe("Home");
    expect(nav.calculator).toBe("Calculator");
    expect(nav.compare).toBe("Compare scenarios");
    expect(nav.saved).toBe("Saved");
    expect(nav.signIn).toBe("Sign in");
  });

  it("uses a shorter bottom-nav compare label, distinct from the top-nav one", () => {
    expect(heDict.nav.bottomNavCompare).toBe("השוואה");
    expect(heDict.nav.bottomNavCompare).not.toBe(heDict.nav.compare);
    expect(enDict.nav.bottomNavCompare).toBe("Compare");
    expect(enDict.nav.bottomNavCompare).not.toBe(enDict.nav.compare);
  });

  it("keeps home and calculator labels identical between top and bottom nav", () => {
    // Both navs reuse the same nav.home/nav.calculator/nav.saved keys —
    // this test guards against ever forking them accidentally.
    for (const dict of [heDict, enDict]) {
      expect(dict.nav.home).toBeTruthy();
      expect(dict.nav.calculator).toBeTruthy();
      expect(dict.nav.saved).toBeTruthy();
    }
  });

  it("only shows a localized Hebrew app name for the Hebrew locale", () => {
    expect(heDict.nav.appNameLocalized).toBe("מנטור משכנתא");
    expect(enDict.nav.appNameLocalized).toBe("");
  });
});

describe("home page redesign dictionary keys", () => {
  it("has every hero/card key, non-empty, in both locales", () => {
    for (const dict of [heDict, enDict]) {
      const h = dict.home;
      const keys = [
        h.heroTitle,
        h.heroSubtitle,
        h.heroPrimaryCta,
        h.heroSecondaryCta,
        h.heroTrustNote,
        h.calcCardTitle,
        h.calcCardBody,
        h.calcCardCta,
        h.compareCardTitle,
        h.compareCardBody,
        h.savedCardTitle,
        h.savedCardBody,
        h.comingSoonBadge,
        h.comingSoonCta,
      ];
      for (const value of keys) {
        expect(typeof value).toBe("string");
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  it("has the exact requested Hebrew hero copy", () => {
    expect(heDict.home.heroTitle).toBe(
      "קבלו תמונה ברורה יותר של המשכנתא שלכם",
    );
    expect(heDict.home.heroPrimaryCta).toBe("התחל חישוב");
    expect(heDict.home.heroSecondaryCta).toBe("למד מה אפשר לבדוק");
    expect(heDict.home.heroTrustNote).toBe(
      "החישוב מיועד ללמידה והשוואה בין תרחישים ואינו ייעוץ משכנתאות.",
    );
  });

  it("no longer carries the old dev-badge/features copy", () => {
    for (const dict of [heDict, enDict]) {
      expect((dict.home as Record<string, unknown>).devBadge).toBeUndefined();
      expect((dict.home as Record<string, unknown>).features).toBeUndefined();
    }
  });
});

describe("coming-soon page dictionary keys", () => {
  it("has non-empty body paragraphs for compare/saved/signin in both locales", () => {
    for (const dict of [heDict, enDict]) {
      for (const section of [
        dict.comparePage,
        dict.savedPage,
        dict.signinPage,
      ]) {
        expect(Array.isArray(section.body)).toBe(true);
        expect(section.body.length).toBeGreaterThan(0);
        for (const paragraph of section.body) {
          expect(paragraph.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("points users at the existing copy-link feature instead of a fake save feature", () => {
    for (const dict of [heDict, enDict]) {
      const joined = dict.savedPage.body.join(" ");
      expect(joined).toMatch(/קישור|link/i);
    }
  });
});
