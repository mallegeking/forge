// Locale config — deliberately dependency-free and free of `next/headers`,
// so it can be imported from proxy.ts (which runs before the request is
// resolved) as well as from client and server components.

export const LOCALES = ["en", "de"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

// The cookie the language switcher writes, and proxy.ts reads/sets.
export const LOCALE_COOKIE = "locale";
// proxy.ts forwards the resolved locale on this request header so the very
// first render (before the cookie round-trips) already sees the right value.
export const LOCALE_HEADER = "x-locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
};

/**
 * Appended to the AI system prompts so the model answers in the user's UI
 * language. English needs no directive (it's the models' default and the
 * prompts are written in English).
 */
export const LANGUAGE_DIRECTIVE: Record<Locale, string> = {
  en: "",
  de: "\n\nWICHTIG: Antworte ausschließlich auf Deutsch — in natürlichem, idiomatischem Deutsch. Behalte Fachbegriffe und Einheiten bei, wo sie üblich sind (z. B. kg, Reps/Wdh., Sätze).",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Pick the best supported locale from an `Accept-Language` header value.
 * Honors quality weights (`;q=`) and matches on the primary subtag, so
 * "de-AT,de;q=0.9,en;q=0.5" resolves to "de". Falls back to DEFAULT_LOCALE.
 */
export function pickLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="));
      const quality = q ? Number.parseFloat(q.slice(2)) : 1;
      return {
        primary: tag.trim().toLowerCase().split("-")[0],
        quality: Number.isFinite(quality) ? quality : 0,
      };
    })
    .filter((entry) => entry.primary)
    .sort((a, b) => b.quality - a.quality);

  for (const entry of ranked) {
    if (isLocale(entry.primary)) return entry.primary;
  }
  return DEFAULT_LOCALE;
}
