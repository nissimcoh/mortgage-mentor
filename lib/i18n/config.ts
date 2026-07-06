export const locales = ["he", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "he";

export function isValidLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function getDirection(locale: Locale): "rtl" | "ltr" {
  return locale === "he" ? "rtl" : "ltr";
}
