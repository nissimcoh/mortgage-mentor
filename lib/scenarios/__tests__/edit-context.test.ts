import { describe, expect, it } from "vitest";
import {
  buildTrustedEditContext,
  computeCalculatorInstanceKey,
  extractSavedScenarioIdParam,
  isEditContextUnavailable,
} from "../edit-context";

const VALID_ID = "123e4567-e89b-12d3-a456-426614174000";

describe("extractSavedScenarioIdParam", () => {
  it("returns a well-formed uuid param", () => {
    expect(extractSavedScenarioIdParam({ savedScenarioId: VALID_ID })).toBe(
      VALID_ID,
    );
  });

  it("returns null when the param is absent", () => {
    expect(extractSavedScenarioIdParam({})).toBeNull();
  });

  it("returns null for a malformed (forged/garbage) id, never passing it through", () => {
    expect(
      extractSavedScenarioIdParam({ savedScenarioId: "not-a-uuid" }),
    ).toBeNull();
    expect(
      extractSavedScenarioIdParam({
        savedScenarioId: "'; DROP TABLE mortgage_scenarios; --",
      }),
    ).toBeNull();
  });

  it("returns null for a multi-valued (array) param instead of picking one", () => {
    expect(
      extractSavedScenarioIdParam({ savedScenarioId: [VALID_ID, VALID_ID] }),
    ).toBeNull();
  });
});

describe("buildTrustedEditContext", () => {
  it("shapes a well-formed row into a trusted edit context", () => {
    const context = buildTrustedEditContext({
      id: VALID_ID,
      name: "הצעת לאומי אוגוסט",
      updated_at: "2026-07-01T12:00:00.000Z",
    });
    expect(context).toEqual({
      id: VALID_ID,
      name: "הצעת לאומי אוגוסט",
      updatedAt: "2026-07-01T12:00:00.000Z",
    });
  });

  it("returns null for a missing row (not found / foreign-owned / signed out, all identical)", () => {
    expect(buildTrustedEditContext(null)).toBeNull();
    expect(buildTrustedEditContext(undefined)).toBeNull();
  });

  it("returns null when a column has an unexpected type, instead of trusting a malformed row", () => {
    expect(
      buildTrustedEditContext({
        id: VALID_ID,
        name: 42,
        updated_at: "2026-07-01T12:00:00.000Z",
      }),
    ).toBeNull();
    expect(
      buildTrustedEditContext({
        id: VALID_ID,
        name: "My mortgage",
        updated_at: null,
      }),
    ).toBeNull();
  });

  it("never reads name/updatedAt from anything other than the row it's given", () => {
    // Structural check that the function's only input is the row — there
    // is no second (query/searchParams) argument it could fall back to.
    expect(buildTrustedEditContext.length).toBe(1);
  });
});

describe("isEditContextUnavailable", () => {
  it("is true when a savedScenarioId was requested but resolution failed", () => {
    expect(
      isEditContextUnavailable({ savedScenarioId: VALID_ID }, null),
    ).toBe(true);
  });

  it("is true for a malformed id too — the request still asked for edit mode", () => {
    expect(
      isEditContextUnavailable({ savedScenarioId: "not-a-uuid" }, null),
    ).toBe(true);
  });

  it("is false when no edit mode was requested at all (ordinary calculator use)", () => {
    expect(isEditContextUnavailable({}, null)).toBe(false);
  });

  it("is false once a trusted context was actually resolved", () => {
    const context = buildTrustedEditContext({
      id: VALID_ID,
      name: "My mortgage",
      updated_at: "2026-07-01T12:00:00.000Z",
    });
    expect(
      isEditContextUnavailable({ savedScenarioId: VALID_ID }, context),
    ).toBe(false);
  });

  it("gives the identical result for not-found, foreign-owned, signed-out, and malformed cases — never distinguishing them", () => {
    const notFoundOrForeignOrSignedOut = isEditContextUnavailable(
      { savedScenarioId: VALID_ID },
      null,
    );
    const malformed = isEditContextUnavailable(
      { savedScenarioId: "garbage" },
      null,
    );
    expect(notFoundOrForeignOrSignedOut).toBe(malformed);
  });
});

const OTHER_ID = "9f8e7d6c-5b4a-3210-9876-543210fedcba";

describe("computeCalculatorInstanceKey", () => {
  it("returns a stable 'normal' key when there is no trusted edit context", () => {
    expect(computeCalculatorInstanceKey(null)).toBe("normal");
  });

  it("returns an id-scoped key when editing a scenario", () => {
    const context = buildTrustedEditContext({
      id: VALID_ID,
      name: "My mortgage",
      updated_at: "2026-07-01T12:00:00.000Z",
    });
    expect(computeCalculatorInstanceKey(context)).toBe(`edit:${VALID_ID}`);
  });

  it("stays IDENTICAL across an external rename/update to the same scenario (updatedAt changes, id doesn't) — must not force a remount", () => {
    const beforeUpdate = buildTrustedEditContext({
      id: VALID_ID,
      name: "My mortgage",
      updated_at: "2026-07-01T12:00:00.000Z",
    });
    const afterExternalUpdate = buildTrustedEditContext({
      id: VALID_ID,
      name: "My mortgage (renamed on another device)",
      updated_at: "2026-07-02T09:30:00.000Z",
    });
    expect(computeCalculatorInstanceKey(beforeUpdate)).toBe(
      computeCalculatorInstanceKey(afterExternalUpdate),
    );
  });

  it("changes when switching from editing scenario A to scenario B", () => {
    const contextA = buildTrustedEditContext({
      id: VALID_ID,
      name: "Scenario A",
      updated_at: "2026-07-01T12:00:00.000Z",
    });
    const contextB = buildTrustedEditContext({
      id: OTHER_ID,
      name: "Scenario B",
      updated_at: "2026-07-01T12:00:00.000Z",
    });
    expect(computeCalculatorInstanceKey(contextA)).not.toBe(
      computeCalculatorInstanceKey(contextB),
    );
  });

  it("changes when leaving edit mode (editing -> normal)", () => {
    const context = buildTrustedEditContext({
      id: VALID_ID,
      name: "My mortgage",
      updated_at: "2026-07-01T12:00:00.000Z",
    });
    expect(computeCalculatorInstanceKey(context)).not.toBe(
      computeCalculatorInstanceKey(null),
    );
  });
});
