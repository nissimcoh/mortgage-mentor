/**
 * User-facing date/time formatting for freshness and provenance display.
 *
 * All underlying data stays plain ISO strings ("YYYY-MM-DD" date-only, or
 * a full ISO datetime) everywhere else in the app — these helpers only
 * change what gets rendered, never what gets stored, parsed, or pinned in
 * a URL.
 */

import type { Locale } from "../i18n/config";

const EMPTY = "—";

function intlLocaleFor(locale: Locale): string {
  // he-IL renders Gregorian dates as DD.MM.YYYY; en-GB (not en-US) renders
  // them as DD/MM/YYYY — both day-first, matching the required formats.
  return locale === "he" ? "he-IL" : "en-GB";
}

/**
 * Date-only display: DD.MM.YYYY (he) / DD/MM/YYYY (en). Safe for both
 * "YYYY-MM-DD" date-only strings and full ISO datetimes. Returns "—" for
 * null/undefined/empty input.
 */
export function formatDateOnly(
  iso: string | null | undefined,
  locale: Locale,
): string {
  if (!iso) return EMPTY;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EMPTY;
  return new Intl.DateTimeFormat(intlLocaleFor(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Jerusalem",
  }).format(date);
}

/**
 * Date + time display in Israel local time: "DD.MM.YYYY, HH:MM" (he) /
 * "DD/MM/YYYY, HH:MM" (en). Returns "—" for null/undefined/empty input.
 */
export function formatDateTimeIsrael(
  iso: string | null | undefined,
  locale: Locale,
): string {
  if (!iso) return EMPTY;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EMPTY;
  return new Intl.DateTimeFormat(intlLocaleFor(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jerusalem",
  }).format(date);
}
