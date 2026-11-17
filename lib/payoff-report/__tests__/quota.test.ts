import { describe, expect, it } from "vitest";
import { DEFAULT_SITE_DAILY_LIMIT, DEFAULT_USER_DAILY_LIMIT, isQuotaClaim, readQuotaLimits } from "../quota";

describe("readQuotaLimits", () => {
  it("defaults when nothing is configured", () => {
    expect(readQuotaLimits({})).toEqual({ user: DEFAULT_USER_DAILY_LIMIT, site: DEFAULT_SITE_DAILY_LIMIT });
  });

  it("reads whole, non-negative numbers and ignores anything else", () => {
    expect(readQuotaLimits({ PAYOFF_REPORT_DAILY_LIMIT: "3", PAYOFF_REPORT_SITE_DAILY_LIMIT: "0" })).toEqual({ user: 3, site: 0 });
    expect(readQuotaLimits({ PAYOFF_REPORT_DAILY_LIMIT: "-1", PAYOFF_REPORT_SITE_DAILY_LIMIT: "2.5" })).toEqual({
      user: DEFAULT_USER_DAILY_LIMIT,
      site: DEFAULT_SITE_DAILY_LIMIT,
    });
    expect(readQuotaLimits({ PAYOFF_REPORT_DAILY_LIMIT: " " }).user).toBe(DEFAULT_USER_DAILY_LIMIT);
  });
});

describe("isQuotaClaim", () => {
  it("accepts only the function's answers", () => {
    for (const value of ["ok", "user-limit", "site-limit", "unauthenticated"]) expect(isQuotaClaim(value)).toBe(true);
    for (const value of [null, undefined, "OK", 1]) expect(isQuotaClaim(value)).toBe(false);
  });
});
