"use client";

import { createContext, useContext } from "react";
import { en, type Dictionary } from "@/lib/i18n/dictionaries/en";
import type { Locale } from "@/lib/i18n/config";

type I18nValue = { dict: Dictionary; locale: Locale };

// Default to English so a component rendered outside the provider still works.
const I18nContext = createContext<I18nValue>({ dict: en, locale: "en" });

export function I18nProvider({
  dict,
  locale,
  children,
}: {
  dict: Dictionary;
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <I18nContext value={{ dict, locale }}>{children}</I18nContext>
  );
}

/** Translation dictionary for the active locale (client components). */
export function useT(): Dictionary {
  return useContext(I18nContext).dict;
}

/** The active locale (client components). */
export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}
