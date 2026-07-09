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

/** Thousands separators for display; URLs always store plain digits. */
export function formatThousands(value: number): string {
  return value.toLocaleString("en-US");
}
