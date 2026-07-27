import { describe, expect, it } from "vitest";
import { formatDateOnly, formatDateTimeIsrael } from "../dates";

const RAW_ISO = "2026-07-27T08:57:24.892Z";
const DATE_ONLY = "2026-07-19";

describe("formatDateOnly", () => {
  it("renders DD.MM.YYYY for Hebrew", () => {
    expect(formatDateOnly(DATE_ONLY, "he")).toBe("19.07.2026");
  });

  it("renders DD/MM/YYYY for English", () => {
    expect(formatDateOnly(DATE_ONLY, "en")).toBe("19/07/2026");
  });

  it("accepts a full ISO datetime and still renders date-only", () => {
    expect(formatDateOnly(RAW_ISO, "he")).toBe("27.07.2026");
  });

  it("never renders the raw ISO string", () => {
    const result = formatDateOnly(RAW_ISO, "he");
    expect(result).not.toContain("T");
    expect(result).not.toContain("Z");
    expect(result).not.toBe(RAW_ISO);
  });

  it("returns the placeholder for null/undefined/empty input", () => {
    expect(formatDateOnly(null, "he")).toBe("—");
    expect(formatDateOnly(undefined, "he")).toBe("—");
    expect(formatDateOnly("", "en")).toBe("—");
  });
});

describe("formatDateTimeIsrael", () => {
  it("renders Israel local time as DD.MM.YYYY, HH:MM for Hebrew", () => {
    // 2026-07-27T08:57:24.892Z is Israel Daylight Time (UTC+3) -> 11:57.
    expect(formatDateTimeIsrael(RAW_ISO, "he")).toBe("27.07.2026, 11:57");
  });

  it("renders Israel local time as DD/MM/YYYY, HH:MM for English", () => {
    expect(formatDateTimeIsrael(RAW_ISO, "en")).toBe("27/07/2026, 11:57");
  });

  it("never renders the raw ISO string", () => {
    const heResult = formatDateTimeIsrael(RAW_ISO, "he");
    const enResult = formatDateTimeIsrael(RAW_ISO, "en");
    for (const result of [heResult, enResult]) {
      expect(result).not.toContain("T");
      expect(result).not.toContain("Z");
      expect(result).not.toBe(RAW_ISO);
    }
  });

  it("returns the placeholder for null/undefined/empty input", () => {
    expect(formatDateTimeIsrael(null, "he")).toBe("—");
    expect(formatDateTimeIsrael(undefined, "en")).toBe("—");
    expect(formatDateTimeIsrael("", "he")).toBe("—");
  });
});
