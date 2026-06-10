import type { Locale } from "../config";
import { en, type Dictionary } from "./en";
import { de } from "./de";

export type { Dictionary } from "./en";

const dictionaries: Record<Locale, Dictionary> = { en, de };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
