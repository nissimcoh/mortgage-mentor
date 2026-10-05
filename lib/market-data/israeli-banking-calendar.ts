/**
 * Banking days, including Fridays and excluding Israeli bank holidays.
 * BOI definition: https://www.boi.org.il/media/r3pjw5z5/154.pdf
 * Annual cross-checks: BOI Zahav calendars for 2026 and 2027 (see tests).
 * Exceptional closures/elections must be maintained when announced; they
 * cannot be inferred from the Hebrew calendar.
 */
const exceptionalClosures = new Set([
  "2021-03-23", // Knesset elections
  "2022-11-01",
  "2026-10-27",
]);

const hebrewDate = new Intl.DateTimeFormat("en-US-u-ca-hebrew", {
  timeZone: "UTC", month: "long", day: "numeric",
});
const israelDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit",
});

export function israelIsoDate(now: Date): string {
  const parts = israelDate.formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function parseIsoDate(isoDate: string): Date {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) ||
      !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate) {
    throw new RangeError(`Invalid banking date: ${isoDate}`);
  }
  return date;
}

function isBankingDate(date: Date): boolean {
  const weekday = date.getUTCDay();
  if (weekday === 6 || exceptionalClosures.has(date.toISOString().slice(0, 10))) return false;
  const parts = hebrewDate.formatToParts(date);
  const month = parts.find((part) => part.type === "month")!.value;
  const day = Number(parts.find((part) => part.type === "day")!.value);
  if (month === "Tishri" && [1, 2, 9, 10, 15, 22].includes(day)) return false;
  if ((month === "Adar" || month === "Adar II") && day === 14) return false;
  if (month === "Nisan" && [15, 21].includes(day)) return false;
  if (month === "Sivan" && day === 6) return false;
  if (month === "Av" && (day === 9 || (day === 10 && weekday === 0))) return false;
  // Modern Independence Day observance: advance Fri/Sat to Thursday,
  // postpone Monday to Tuesday; otherwise observe on 5 Iyar.
  if (month === "Iyar" && (
    (day === 5 && weekday !== 1 && weekday !== 5) ||
    ([3, 4].includes(day) && weekday === 4) ||
    (day === 6 && weekday === 2)
  )) return false;
  return true;
}

export function isIsraeliBankingDay(isoDate: string): boolean {
  return isBankingDate(parseIsoDate(isoDate));
}

/** Date-level activation; this does not model intraday settlement hours. */
export function nextIsraeliBusinessDay(isoDate: string): string {
  const date = parseIsoDate(isoDate);
  do {
    date.setUTCDate(date.getUTCDate() + 1);
  } while (!isBankingDate(date));
  return date.toISOString().slice(0, 10);
}
