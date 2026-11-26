import type { Dictionary } from "@/app/[locale]/dictionaries";
import { formatDateOnly } from "@/lib/forms/dates";
import type { Locale } from "@/lib/i18n/config";
import { fillTemplate } from "@/lib/payoff-report/present";

/** What a screen needs to offer shareable images. */
export interface ShareContext {
  labels: Dictionary["shareImage"];
  siteName: string;
}

/** "Created on <today>", as printed in an image's footer. */
export function createdOnText(labels: Dictionary["shareImage"], locale: Locale, now = new Date()): string {
  return fillTemplate(labels.createdOn, { date: formatDateOnly(now.toISOString(), locale) });
}
