import "server-only";

import type { Locale } from "@/lib/i18n/config";
import type heDictionary from "./dictionaries/he.json";

/** Shape of all dictionaries; Hebrew is the source of truth. */
export type Dictionary = typeof heDictionary;

const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  he: () => import("./dictionaries/he.json").then((module) => module.default),
  en: () => import("./dictionaries/en.json").then((module) => module.default),
};

export const getDictionary = (locale: Locale): Promise<Dictionary> =>
  dictionaries[locale]();
