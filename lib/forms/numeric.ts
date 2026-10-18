/**
 * Shared parsing/formatting helpers for numeric text inputs
 * (type="text" + inputMode), used by the calculator forms.
 */

/**
 * Whole shekels, optionally grouped in threes with commas or spaces and
 * prefixed/suffixed with ₪. Never discard a sign, decimal or other text.
 */
export function parseWholeAmount(raw: string): number | null {
  if ((raw.match(/₪/g) ?? []).length > 1) return null;
  const amount = raw.trim().replace(/^₪\s*|\s*₪$/g, "");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)$/.test(amount)) return null;
  const value = Number(stripAmountSeparators(amount));
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Parse a non-negative decimal rate typed by a user, accepting both "4.8"
 * and "4,8". Returns null when invalid.
 */
export function parseDecimalRate(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".").replace(/%$/, "");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

/**
 * Parse a signed decimal (e.g. stress shifts like "+1", "-0.5", "2"),
 * accepting a decimal comma. Returns null when invalid.
 */
export function parseSignedDecimal(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

/** Thousands separators for display; URLs always store plain digits. */
export function formatThousands(value: number): string {
  return value.toLocaleString("en-US");
}

/**
 * Remove display separators only. This is not validation: callers must
 * validate before treating the result as an amount.
 */
export function stripAmountSeparators(raw: string): string {
  return raw.replace(/[\s,₪]/g, "");
}

/**
 * Format valid amounts; keep invalid pasted/typed text visible for validation.
 */
export function formatAmountWhileTyping(raw: string): string {
  const amount = parseWholeAmount(raw);
  return amount === null ? raw : formatThousands(amount);
}

/** Regroup only a native digit insertion/deletion in an already valid field.
 * Pasted/replacement text always goes through the strict amount grammar. */
export function formatAmountEdit(
  raw: string,
  start: number,
  end: number,
  previous: string,
  inputType = "",
  data: string | null = null,
): { value: string; start: number; end: number } {
  const regroup = parseWholeAmount(previous) !== null &&
    ((inputType === "insertText" && /^\d+$/.test(data ?? "")) || inputType.startsWith("delete")) &&
    /^[\d,]*$/.test(raw);
  const value = formatAmountWhileTyping(regroup ? raw.replace(/,/g, "") : raw);
  if (value === raw) return { value, start, end };
  const position = (offset: number) => {
    const removedDigits = raw.replace(/\D/g, "").length - value.replace(/\D/g, "").length;
    let left = Math.max(0, raw.slice(0, offset).replace(/\D/g, "").length - removedDigits);
    if (left === 0) return 0;
    for (let index = 0; index < value.length; index++) {
      if (/\d/.test(value[index]) && --left === 0) return index + 1;
    }
    return value.length;
  };
  return { value, start: position(start), end: position(end) };
}
