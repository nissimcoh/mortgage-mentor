/**
 * Shared parsing/formatting helpers for numeric text inputs
 * (type="text" + inputMode), used by the calculator forms.
 */

/**
 * Parse a whole-shekel amount typed by a user: digits only, commas and
 * spaces allowed ("800000", "800,000"). Returns null when invalid
 * (including empty strings and decimal values).
 */
export function parseWholeAmount(raw: string): number | null {
  const digits = raw.replace(/[\s,₪]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  return Number(digits);
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
 * Digits only — strips spaces, commas, currency symbols, and anything else
 * non-numeric. Used for live "format while typing" amount inputs and for
 * pasted values like "500,000" or "₪500,000".
 */
export function stripAmountSeparators(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Live "format while typing" for amount inputs: keeps only digits typed or
 * pasted so far, then adds thousands separators as they accumulate ("500000"
 * -> "500,000" as each digit lands). Empty stays empty.
 *
 * Unlike `formatAmountForDisplay` (used on blur / URL hydration, where a
 * malformed value is shown as-is so the field-error message stays legible),
 * this never falls back to the raw input — every non-digit character is
 * simply dropped, since that's the expected live-typing/paste experience.
 */
export function formatAmountWhileTyping(raw: string): string {
  const digits = stripAmountSeparators(raw);
  return digits === "" ? "" : formatThousands(Number(digits));
}
