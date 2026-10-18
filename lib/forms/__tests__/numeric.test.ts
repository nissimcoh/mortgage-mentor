import { describe, expect, it } from "vitest";
import {
  formatAmountWhileTyping,
  formatAmountEdit,
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

  it("keeps invalid non-numeric input visible", () => {
    expect(stripAmountSeparators("")).toBe("");
    expect(stripAmountSeparators("abc")).toBe("abc");
  });

  it("preserves stray characters for validation", () => {
    expect(stripAmountSeparators("50a0000")).toBe("50a0000");
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

  it("preserves invalid text instead of inventing a different amount", () => {
    expect(formatAmountWhileTyping("abc")).toBe("abc");
    expect(formatAmountWhileTyping("50a0000")).toBe("50a0000");
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
      value = formatAmountEdit(value + digit, value.length + 1, value.length + 1, value, "insertText", digit).value;
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


describe("safe amount edits", () => {
  it.each(["500,000.50", "-500000", "+500000", "4,5", "1e6", "50a0000", "1,00,000", "9007199254740992", "9".repeat(320)])("does not turn invalid %s into a different valid amount", raw => {
    expect(parseWholeAmount(raw)).toBeNull();
    expect(formatAmountWhileTyping(raw)).toBe(raw);
    expect(formatAmountEdit(raw, raw.length, raw.length, "500,000", "insertFromPaste").value).toBe(raw);
  });
  it.each(["500 000", "500\u00a0000", "500\u202f000", "500,000 ₪"]) ("accepts correctly grouped %s", raw => {
    expect(parseWholeAmount(raw)).toBe(500000);
    expect(formatAmountWhileTyping(raw)).toBe("500,000");
  });
  it("preserves the caret when inserting a digit inside an already formatted value", () => {
    expect(formatAmountEdit("5910,000", 2, 2, "510,000", "insertText", "9")).toEqual({value: "5,910,000", start: 3, end: 3});
  });
  it("allows backspace across a comma without trapping the caret", () => {
    expect(formatAmountEdit("500000", 3, 3, "500,000", "deleteContentBackward")).toEqual({value: "500,000", start: 3, end: 3});
    expect(formatAmountEdit("50,000", 2, 2, "500,000", "deleteContentBackward")).toEqual({value: "50,000", start: 2, end: 2});
  });
  it("does not strip invalid signs while the user edits", () => {
    expect(formatAmountEdit("-500001", 7, 7, "-500000", "insertText", "1").value).toBe("-500001");
  });
  it("can clear the last digit and retains a selected digit range after formatting", () => {
    expect(formatAmountEdit("", 0, 0, "1", "deleteContentBackward")).toEqual({value: "", start: 0, end: 0});
    expect(formatAmountEdit("1234567", 1, 4, "", "insertFromPaste")).toEqual({value: "1,234,567", start: 1, end: 5});
  });
});
