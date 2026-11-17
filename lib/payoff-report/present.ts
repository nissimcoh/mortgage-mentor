import type { PayoffCheck } from "./checks";
import type { PayoffReportFile, PayoffTrack } from "./types";

/** Small, UI-free helpers for showing and editing report figures. */

/** Replace `{name}` placeholders. Unknown placeholders are left as they are. */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/**
 * A number typed by the user: "" clears it, separators and symbols are
 * ignored, anything else non-numeric is rejected (undefined) so the field
 * can revert instead of silently storing garbage.
 */
export function parseNumberInput(text: string): number | null | undefined {
  const cleaned = text.replace(/[,\s%₪]/g, "");
  if (cleaned === "") return null;
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : undefined;
}

export function formatMoney(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** `YYYY-MM-DD` as DD/MM/YYYY, the way Israeli reports print it. */
export function formatIsoDate(date: string | null): string {
  if (date === null) return "";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

/** A check's message with its amounts filled in. */
export function checkMessage(
  check: PayoffCheck,
  templates: Record<PayoffCheck["code"], string>,
  locale: string,
): string {
  const amount = (value: number | null) => (value === null ? "" : formatMoney(value, locale));
  return fillTemplate(templates[check.code], {
    expected: amount(check.expected),
    actual: amount(check.actual),
  });
}

/** Immutable update of one track inside a file. */
export function updateTrackInFile(
  file: PayoffReportFile,
  loanIndex: number,
  trackIndex: number,
  update: (track: PayoffTrack) => PayoffTrack,
): PayoffReportFile {
  return {
    ...file,
    loans: file.loans.map((loan, index) =>
      index !== loanIndex
        ? loan
        : {
            ...loan,
            tracks: loan.tracks.map((track, position) =>
              position === trackIndex ? update(track) : track,
            ),
          },
    ),
  };
}
