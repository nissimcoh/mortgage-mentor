import { describe, expect, it } from "vitest";
import { sanitizeNextPath } from "../redirect-target";

const FALLBACK = "/he/saved";

describe("sanitizeNextPath", () => {
  it("keeps a valid locale-prefixed in-app path", () => {
    expect(sanitizeNextPath("/he/saved", FALLBACK)).toBe("/he/saved");
    expect(sanitizeNextPath("/en/calculator?trackCount=1", FALLBACK)).toBe(
      "/en/calculator?trackCount=1",
    );
    expect(sanitizeNextPath("/he", FALLBACK)).toBe("/he");
  });

  it("falls back for empty/null/undefined input", () => {
    expect(sanitizeNextPath(null, FALLBACK)).toBe(FALLBACK);
    expect(sanitizeNextPath(undefined, FALLBACK)).toBe(FALLBACK);
    expect(sanitizeNextPath("", FALLBACK)).toBe(FALLBACK);
  });

  it("rejects protocol-relative paths", () => {
    expect(sanitizeNextPath("//evil.com", FALLBACK)).toBe(FALLBACK);
    expect(sanitizeNextPath("//evil.com/he/saved", FALLBACK)).toBe(FALLBACK);
  });

  it("rejects absolute URLs and non-path schemes", () => {
    expect(sanitizeNextPath("https://evil.com", FALLBACK)).toBe(FALLBACK);
    expect(sanitizeNextPath("http://evil.com/he", FALLBACK)).toBe(FALLBACK);
    expect(sanitizeNextPath("javascript:alert(1)", FALLBACK)).toBe(FALLBACK);
  });

  it("rejects a path missing a recognized locale prefix", () => {
    expect(sanitizeNextPath("/saved", FALLBACK)).toBe(FALLBACK);
    expect(sanitizeNextPath("/fr/saved", FALLBACK)).toBe(FALLBACK);
    expect(sanitizeNextPath("/heavy/path", FALLBACK)).toBe(FALLBACK);
  });
});
