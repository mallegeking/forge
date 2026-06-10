import { describe, it, expect } from "vitest";
import { pickLocale, isLocale, DEFAULT_LOCALE } from "./config";

describe("isLocale", () => {
  it("accepts supported locales", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isLocale("fr")).toBe(false);
    expect(isLocale("")).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});

describe("pickLocale", () => {
  it("falls back to the default when the header is missing", () => {
    expect(pickLocale(null)).toBe(DEFAULT_LOCALE);
    expect(pickLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(pickLocale("")).toBe(DEFAULT_LOCALE);
  });

  it("matches on the primary subtag", () => {
    expect(pickLocale("de-AT")).toBe("de");
    expect(pickLocale("en-US")).toBe("en");
  });

  it("honors quality weights over list order", () => {
    expect(pickLocale("en;q=0.5,de;q=0.9")).toBe("de");
    expect(pickLocale("de;q=0.3,en;q=0.8")).toBe("en");
  });

  it("prefers the first supported locale in a mixed list", () => {
    // fr is unsupported and should be skipped in favor of de.
    expect(pickLocale("fr-FR,fr;q=0.9,de;q=0.8,en;q=0.7")).toBe("de");
  });

  it("falls back to the default when nothing is supported", () => {
    expect(pickLocale("fr-FR,es;q=0.9")).toBe(DEFAULT_LOCALE);
  });
});
