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

// Intl.DateTimeFormat construction is comparatively expensive and these
// helpers run many times per render (freshness cards, admin tables), so
// one formatter per locale and style is built lazily and reused.
const dateOnlyFormats = new Map<Locale, Intl.DateTimeFormat>();
const dateTimeFormats = new Map<Locale, Intl.DateTimeFormat>();

function dateOnlyFormat(locale: Locale): Intl.DateTimeFormat {
  let format = dateOnlyFormats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(intlLocaleFor(locale), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Asia/Jerusalem",
    });
    dateOnlyFormats.set(locale, format);
  }
  return format;
}

function dateTimeFormat(locale: Locale): Intl.DateTimeFormat {
  let format = dateTimeFormats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(intlLocaleFor(locale), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Jerusalem",
    });
    dateTimeFormats.set(locale, format);
  }
  return format;
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
  return dateOnlyFormat(locale).format(date);
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
  return dateTimeFormat(locale).format(date);
}
