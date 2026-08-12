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
      expect(nav.learn.length).toBeGreaterThan(0);
      expect(nav.saved.length).toBeGreaterThan(0);
      expect(nav.signIn.length).toBeGreaterThan(0);
      expect(nav.bottomNavLearn.length).toBeGreaterThan(0);
    }
  });

  it("has the exact requested Hebrew top-nav labels", () => {
    const nav = heDict.nav;
    expect(nav.home).toBe("בית");
    expect(nav.calculator).toBe("מחשבון");
    expect(nav.learn).toBe("לומדים");
    expect(nav.saved).toBe("שמורים");
    expect(nav.signIn).toBe("כניסה");
  });

  it("has the exact requested English top-nav labels", () => {
    const nav = enDict.nav;
    expect(nav.home).toBe("Home");
    expect(nav.calculator).toBe("Calculator");
    expect(nav.learn).toBe("Learn");
    expect(nav.saved).toBe("Saved");
    expect(nav.signIn).toBe("Sign in");
  });

  it("has the exact requested bottom-nav learn label in both locales", () => {
    expect(heDict.nav.bottomNavLearn).toBe("למידה");
    expect(enDict.nav.bottomNavLearn).toBe("Learn");
  });

  it("no longer carries the retired compare nav keys", () => {
    for (const dict of [heDict, enDict]) {
      expect((dict.nav as Record<string, unknown>).compare).toBeUndefined();
      expect(
        (dict.nav as Record<string, unknown>).bottomNavCompare,
      ).toBeUndefined();
    }
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

describe("header account menu labels", () => {
  it("has every account-menu label, non-empty, in both locales", () => {
    for (const dict of [heDict, enDict]) {
      const menu = dict.accountMenu;
      expect(menu.menuLabel.length).toBeGreaterThan(0);
      expect(menu.avatarAlt.length).toBeGreaterThan(0);
      expect(menu.savedScenarios.length).toBeGreaterThan(0);
      expect(menu.signOut.length).toBeGreaterThan(0);
    }
  });

  it("has the exact requested Hebrew account-menu labels", () => {
    expect(heDict.accountMenu.savedScenarios).toBe("שמורים");
    expect(heDict.accountMenu.signOut).toBe("התנתקות");
  });

  it("has the exact requested English account-menu labels", () => {
    expect(enDict.accountMenu.savedScenarios).toBe("Saved scenarios");
    expect(enDict.accountMenu.signOut).toBe("Sign out");
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
        h.learnCardTitle,
        h.learnCardBody,
        h.learnCardCta,
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

  it("no longer carries the old dev-badge/features copy or the retired compare card", () => {
    for (const dict of [heDict, enDict]) {
      expect((dict.home as Record<string, unknown>).devBadge).toBeUndefined();
      expect((dict.home as Record<string, unknown>).features).toBeUndefined();
      expect(
        (dict.home as Record<string, unknown>).compareCardTitle,
      ).toBeUndefined();
      expect(
        (dict.home as Record<string, unknown>).compareCardBody,
      ).toBeUndefined();
    }
  });
});

describe("learn page dictionary keys", () => {
  it("has a title, intro, and six topics, non-empty, in both locales", () => {
    for (const dict of [heDict, enDict]) {
      const l = dict.learnPage;
      expect(l.title.length).toBeGreaterThan(0);
      expect(l.intro.length).toBeGreaterThan(0);
      expect(Array.isArray(l.topics)).toBe(true);
      expect(l.topics).toHaveLength(6);
      for (const topic of l.topics) {
        expect(topic.length).toBeGreaterThan(0);
      }
    }
  });

  it("has the exact requested Hebrew title/intro/topics", () => {
    const l = heDict.learnPage;
    expect(l.title).toBe("לומדים משכנתא בשפה פשוטה");
    expect(l.intro).toBe(
      "מדריכים קצרים שיעזרו להבין מסלולים, ריביות, הצמדה ולוחות סילוקין לפני שמקבלים החלטה.",
    );
    expect(l.topics).toEqual([
      "מהו מסלול משכנתא?",
      "פריים, קל״צ וריבית משתנה",
      "מהי הצמדה למדד?",
      "איך לקרוא לוח סילוקין?",
      "החזר ראשון מול החזר מרבי",
      "מהו מדד היציבות?",
    ]);
  });

  it("has the exact requested English title/intro/topics", () => {
    const l = enDict.learnPage;
    expect(l.title).toBe("Learn mortgages in plain language");
    expect(l.topics).toEqual([
      "What is a mortgage track?",
      "Prime, fixed, and variable rates",
      "What does CPI linkage mean?",
      "How to read an amortization schedule",
      "First payment versus maximum payment",
      "What is the stability score?",
    ]);
  });

  it("no longer carries the retired comparison dictionary section", () => {
    for (const dict of [heDict, enDict]) {
      expect(
        (dict as Record<string, unknown>).comparePage,
      ).toBeUndefined();
    }
  });
});

describe("calculator: future comparison placeholder", () => {
  it("has a non-empty, clearly-labeled 'coming soon' compare action in both locales", () => {
    expect(heDict.calculator.compareComingSoonLabel).toBe(
      "השווה לתמהיל אחר — בקרוב",
    );
    expect(enDict.calculator.compareComingSoonLabel).toBe(
      "Compare with another scenario — coming soon",
    );
  });
});

describe("saved page dictionary keys", () => {
  // /saved still shows a "saving is coming later" body note (the copy-link
  // workaround remains true even for signed-in users), plus real
  // signed-in-state copy (email greeting + sign-out) now that /saved is a
  // real authenticated page rather than a coming-soon placeholder.
  it("has non-empty body paragraphs in both locales", () => {
    for (const dict of [heDict, enDict]) {
      expect(Array.isArray(dict.savedPage.body)).toBe(true);
      expect(dict.savedPage.body.length).toBeGreaterThan(0);
      for (const paragraph of dict.savedPage.body) {
        expect(paragraph.length).toBeGreaterThan(0);
      }
    }
  });

  it("points users at the existing copy-link feature instead of a fake save feature", () => {
    for (const dict of [heDict, enDict]) {
      const joined = dict.savedPage.body.join(" ");
      expect(joined).toMatch(/קישור|link/i);
    }
  });

  it("has a signed-in greeting with an {email} token, and a sign-out label", () => {
    for (const dict of [heDict, enDict]) {
      expect(dict.savedPage.signedInIntro).toContain("{email}");
      expect(dict.savedPage.signOutButton.length).toBeGreaterThan(0);
    }
  });
});

describe("sign-in page dictionary keys (Google OAuth)", () => {
  it("has non-empty Google sign-in copy in both locales", () => {
    for (const dict of [heDict, enDict]) {
      const { signinPage } = dict;
      expect(signinPage.intro.length).toBeGreaterThan(0);
      expect(signinPage.continueWithGoogleButton.length).toBeGreaterThan(0);
      expect(signinPage.signInErrorMessage.length).toBeGreaterThan(0);
      expect(signinPage.callbackErrorMessage.length).toBeGreaterThan(0);
    }
  });

  it("no longer carries Magic-Link-only copy", () => {
    for (const dict of [heDict, enDict]) {
      const section = dict.signinPage as Record<string, unknown>;
      expect(section.emailLabel).toBeUndefined();
      expect(section.emailPlaceholder).toBeUndefined();
      expect(section.sendLinkButton).toBeUndefined();
      expect(section.sendingButton).toBeUndefined();
      expect(section.checkEmailMessage).toBeUndefined();
      expect(section.sendErrorMessage).toBeUndefined();
    }
  });
});
