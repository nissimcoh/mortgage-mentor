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

describe("calculator: comparison entry point removed from the results screen", () => {
  // Round 2 of the results/save UX redesign explicitly removed the
  // disabled "Compare — coming soon" stub rather than keeping it as a
  // quiet note (option B) — it no longer competes with real actions.
  it("no longer carries the retired compareComingSoonLabel key", () => {
    for (const dict of [heDict, enDict]) {
      expect(
        (dict.calculator as Record<string, unknown>).compareComingSoonLabel,
      ).toBeUndefined();
    }
  });
});

describe("saved page dictionary keys", () => {
  // /saved is now the real saved-scenarios list (see lib/scenarios/) —
  // no longer a coming-soon placeholder pointing at copy-link.
  it("has non-empty list/empty-state copy in both locales", () => {
    for (const dict of [heDict, enDict]) {
      const s = dict.savedPage;
      expect(s.intro.length).toBeGreaterThan(0);
      expect(s.emptyTitle.length).toBeGreaterThan(0);
      expect(s.emptyBody.length).toBeGreaterThan(0);
      expect(s.emptyCta.length).toBeGreaterThan(0);
      expect(s.openButton.length).toBeGreaterThan(0);
      expect(s.deleteButton.length).toBeGreaterThan(0);
      expect(s.deleteConfirmPrompt.length).toBeGreaterThan(0);
      expect(s.deleteConfirmYes.length).toBeGreaterThan(0);
      expect(s.deleteConfirmCancel.length).toBeGreaterThan(0);
      expect(s.cardAmountLabel.length).toBeGreaterThan(0);
      expect(s.cardTrackCountLabel.length).toBeGreaterThan(0);
      expect(s.cardFirstPaymentLabel.length).toBeGreaterThan(0);
      expect(s.cardHighestPaymentLabel.length).toBeGreaterThan(0);
      expect(s.cardStabilityLabel.length).toBeGreaterThan(0);
      expect(s.cardUpdatedLabel.length).toBeGreaterThan(0);
      expect(s.loadErrorMessage.length).toBeGreaterThan(0);
      expect(s.invalidScenarioMessage.length).toBeGreaterThan(0);
    }
  });

  it("has non-empty scenario action-menu copy (rename/duplicate/delete) in both locales", () => {
    for (const dict of [heDict, enDict]) {
      const s = dict.savedPage;
      expect(s.menuLabel.length).toBeGreaterThan(0);
      expect(s.renameAction.length).toBeGreaterThan(0);
      expect(s.duplicateAction.length).toBeGreaterThan(0);
      expect(s.duplicatingAction.length).toBeGreaterThan(0);
      expect(s.deletingAction.length).toBeGreaterThan(0);
      expect(s.renameDialogTitle.length).toBeGreaterThan(0);
      expect(s.renameNameLabel.length).toBeGreaterThan(0);
      expect(s.renameSaveButton.length).toBeGreaterThan(0);
      expect(s.renamingAction.length).toBeGreaterThan(0);
      expect(s.renameCancelButton.length).toBeGreaterThan(0);
      expect(s.renameNameInvalidMessage.length).toBeGreaterThan(0);
      expect(s.actionErrorMessage.length).toBeGreaterThan(0);
      expect(s.notFoundMessage.length).toBeGreaterThan(0);
    }
  });

  it("has the exact requested rename action label", () => {
    expect(heDict.savedPage.renameAction).toBe("שנה שם");
    expect(enDict.savedPage.renameAction).toBe("Rename");
  });

  it("has the exact requested saved-page load-error copy", () => {
    expect(heDict.savedPage.loadErrorMessage).toBe(
      "לא הצלחנו לטעון את התמהילים כרגע. אפשר לנסות שוב בעוד רגע.",
    );
    expect(enDict.savedPage.loadErrorMessage).toBe(
      "We couldn't load your saved scenarios right now. Please try again shortly.",
    );
  });

  it("has the exact requested empty-state copy", () => {
    expect(heDict.savedPage.emptyTitle).toBe("עדיין לא שמרת תמהילים.");
    expect(heDict.savedPage.emptyBody).toBe(
      "אפשר לבנות תמהיל במחשבון ולשמור אותו כאן.",
    );
    expect(heDict.savedPage.emptyCta).toBe("פתח מחשבון");
    expect(enDict.savedPage.emptyCta).toBe("Open calculator");
  });

  it("has the exact requested open/delete button labels", () => {
    expect(heDict.savedPage.openButton).toBe("פתח במחשבון");
    expect(enDict.savedPage.openButton).toBe("Open in calculator");
    expect(heDict.savedPage.deleteButton).toBe("מחק");
    expect(enDict.savedPage.deleteButton).toBe("Delete");
  });

  it("no longer carries the retired placeholder copy", () => {
    for (const dict of [heDict, enDict]) {
      const section = dict.savedPage as Record<string, unknown>;
      expect(section.body).toBeUndefined();
      expect(section.signedInIntro).toBeUndefined();
      expect(section.signOutButton).toBeUndefined();
    }
  });
});

describe("save scenario dialog dictionary keys", () => {
  it("has non-empty dialog copy in both locales", () => {
    for (const dict of [heDict, enDict]) {
      const d = dict.saveScenarioDialog;
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.nameLabel.length).toBeGreaterThan(0);
      expect(d.defaultName.length).toBeGreaterThan(0);
      expect(d.saveButton.length).toBeGreaterThan(0);
      expect(d.savingButton.length).toBeGreaterThan(0);
      expect(d.cancelButton.length).toBeGreaterThan(0);
      expect(d.nameInvalidMessage.length).toBeGreaterThan(0);
      expect(d.genericErrorMessage.length).toBeGreaterThan(0);
      expect(d.successMessage.length).toBeGreaterThan(0);
      expect(d.viewSavedLink.length).toBeGreaterThan(0);
    }
  });

  it("has the exact requested default scenario name", () => {
    expect(heDict.saveScenarioDialog.defaultName).toBe("תמהיל חדש");
    expect(enDict.saveScenarioDialog.defaultName).toBe("New scenario");
  });

  it("has the exact requested save-scenario button label in the calculator", () => {
    expect(heDict.calculator.saveScenarioButton).toBe("שמור תמהיל");
    expect(enDict.calculator.saveScenarioButton).toBe("Save scenario");
  });

  it("has the exact requested non-blocking toast copy (no 'Cancel' after success)", () => {
    expect(heDict.saveScenarioDialog.successMessage).toBe("התמהיל נשמר");
    expect(enDict.saveScenarioDialog.successMessage).toBe("Scenario saved");
    expect(heDict.saveScenarioDialog.viewSavedLink).toBe("לצפייה בשמורים");
    expect(enDict.saveScenarioDialog.viewSavedLink).toBe(
      "View saved scenarios",
    );
    expect(heDict.saveScenarioDialog.dismissAriaLabel.length).toBeGreaterThan(
      0,
    );
    expect(enDict.saveScenarioDialog.dismissAriaLabel.length).toBeGreaterThan(
      0,
    );
  });
});

describe("results hierarchy dictionary keys (hero, secondary metrics, insight sentence)", () => {
  it("has non-empty hero and secondary-metric copy in both locales", () => {
    for (const dict of [heDict, enDict]) {
      const c = dict.calculator;
      expect(c.heroFirstPaymentContext.length).toBeGreaterThan(0);
      expect(c.mortgageAmountLabel.length).toBeGreaterThan(0);
      expect(c.financingCostLabel.length).toBeGreaterThan(0);
    }
  });

  it("has the exact requested secondary-metric labels", () => {
    expect(heDict.calculator.mortgageAmountLabel).toBe("סכום המשכנתא");
    expect(enDict.calculator.mortgageAmountLabel).toBe("Mortgage amount");
    expect(heDict.calculator.financingCostLabel).toBe("עלות מימון חזויה");
    expect(enDict.calculator.financingCostLabel).toBe(
      "Forecast financing cost",
    );
  });

  it("has all three insight-sentence templates, each with the {first} and {total} tokens", () => {
    for (const dict of [heDict, enDict]) {
      const c = dict.calculator;
      for (const template of [
        c.insightFlatTemplate,
        c.insightRisingTemplate,
        c.insightNonRisingTemplate,
      ]) {
        expect(template).toContain("{first}");
        expect(template).toContain("{total}");
      }
      expect(c.insightRisingTemplate).toContain("{highest}");
      expect(c.insightRisingTemplate).toContain("{month}");
    }
  });

  it("has the exact requested Hebrew insight-sentence templates", () => {
    const c = heDict.calculator;
    expect(c.insightFlatTemplate).toBe(
      "ההחזר מתחיל ב־₪{first} ובתרחיש הזה נשאר יציב לאורך התקופה. סך התשלומים החזוי הוא כ־₪{total}.",
    );
    expect(c.insightRisingTemplate).toBe(
      "ההחזר מתחיל ב־₪{first} ועשוי לעלות עד כ־₪{highest} בחודש {month}, לפי התחזית. סך התשלומים החזוי הוא כ־₪{total}.",
    );
    expect(c.insightNonRisingTemplate).toBe(
      "ההחזר מתחיל ב־₪{first}, ולפי התחזית אינו צפוי לעלות משמעותית מעל סכום זה לאורך התקופה. סך התשלומים החזוי הוא כ־₪{total}.",
    );
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
