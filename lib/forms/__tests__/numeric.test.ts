import { describe, expect, it } from "vitest";
import {
  formatAmountWhileTyping,
  formatThousands,
  parseDecimalRate,
  parseSignedDecimal,
  parseWholeAmount,
  stripAmountSeparators,
} from "../numeric";

describe("stripAmountSeparators", () => {
  it("keeps only digits", () => {
    expect(stripAmountSeparators("500000")).toBe("500000");
    expect(stripAmountSeparators("500,000")).toBe("500000");
    expect(stripAmountSeparators("₪500,000")).toBe("500000");
    expect(stripAmountSeparators("₪ 500,000 ")).toBe("500000");
  });

  it("returns empty for empty or fully non-numeric input", () => {
    expect(stripAmountSeparators("")).toBe("");
    expect(stripAmountSeparators("abc")).toBe("");
  });

  it("drops any stray non-digit characters typed accidentally", () => {
    expect(stripAmountSeparators("50a0000")).toBe("500000");
  });
});

describe("formatAmountWhileTyping", () => {
  it("formats live as digits accumulate, exactly matching the requested examples", () => {
    expect(formatAmountWhileTyping("500000")).toBe("500,000");
    expect(formatAmountWhileTyping("1200000")).toBe("1,200,000");
  });

  it("keeps empty input empty", () => {
    expect(formatAmountWhileTyping("")).toBe("");
  });

  it("ignores non-digit characters typed or already present", () => {
    expect(formatAmountWhileTyping("abc")).toBe("");
    expect(formatAmountWhileTyping("50a0000")).toBe("500,000");
  });

  it("supports pasted values with separators or a currency sign", () => {
    expect(formatAmountWhileTyping("500,000")).toBe("500,000");
    expect(formatAmountWhileTyping("₪500,000")).toBe("500,000");
  });

  it("progressively formats as if typed digit by digit", () => {
    const typed = "1200000";
    let value = "";
    const seen: string[] = [];
    for (const digit of typed) {
      value = formatAmountWhileTyping(value + digit);
      seen.push(value);
    }
    expect(seen).toEqual([
      "1",
      "12",
      "120",
      "1,200",
      "12,000",
      "120,000",
      "1,200,000",
    ]);
  });

  it("does not add a separator below the thousands threshold", () => {
    expect(formatAmountWhileTyping("500")).toBe("500");
    expect(formatAmountWhileTyping("0")).toBe("0");
  });
});

describe("parseWholeAmount (unaffected by live formatting)", () => {
  it("parses comma-formatted and currency-prefixed values the same as plain digits", () => {
    expect(parseWholeAmount("500000")).toBe(500000);
    expect(parseWholeAmount("500,000")).toBe(500000);
    expect(parseWholeAmount("₪500,000")).toBe(500000);
    expect(parseWholeAmount("1,200,000")).toBe(1200000);
  });

  it("rejects empty, decimal, and non-numeric input", () => {
    expect(parseWholeAmount("")).toBeNull();
    expect(parseWholeAmount("abc")).toBeNull();
    expect(parseWholeAmount("500.5")).toBeNull();
  });
});

describe("formatThousands", () => {
  it("adds comma separators", () => {
    expect(formatThousands(500000)).toBe("500,000");
    expect(formatThousands(1200000)).toBe("1,200,000");
    expect(formatThousands(500)).toBe("500");
  });
});

describe("rate/shift parsers are untouched by amount formatting", () => {
  it("parseDecimalRate accepts a plain decimal rate, no thousands separators involved", () => {
    expect(parseDecimalRate("4.8")).toBe(4.8);
    expect(parseDecimalRate("4,8")).toBe(4.8);
  });

  it("parseSignedDecimal accepts signed shifts", () => {
    expect(parseSignedDecimal("+1")).toBe(1);
    expect(parseSignedDecimal("-0.5")).toBe(-0.5);
  });
});
