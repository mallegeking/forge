import { describe, it, expect } from "vitest";
import {
  EXERCISE_CATALOG,
  catalogSuggestions,
  type CatalogEntry,
} from "./exercise-catalog";

describe("EXERCISE_CATALOG data hygiene", () => {
  it("has no duplicate names (case-insensitive)", () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const e of EXERCISE_CATALOG) {
      const key = e.name.trim().toLowerCase();
      if (seen.has(key)) dupes.push(e.name);
      seen.set(key, e.name);
    }
    expect(dupes).toEqual([]);
  });

  it("has trimmed names and a valid type on every entry", () => {
    for (const e of EXERCISE_CATALOG) {
      expect(e.name).toBe(e.name.trim());
      expect(e.name.length).toBeGreaterThan(0);
      expect(["compound", "isolation"]).toContain(e.type);
    }
  });

  it("is big enough to be worth browsing", () => {
    expect(EXERCISE_CATALOG.length).toBeGreaterThanOrEqual(100);
  });
});

describe("catalogSuggestions", () => {
  const names = (entries: CatalogEntry[]) => entries.map((e) => e.name);

  it("matches on a substring of the name", () => {
    const out = names(catalogSuggestions("hack", []));
    expect(out).toContain("Hack Squat");
    expect(out.every((n) => n.toLowerCase().includes("hack"))).toBe(true);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(names(catalogSuggestions("  HACK ", []))).toContain("Hack Squat");
  });

  it("hides entries already in the library, matched loosely on name", () => {
    const out = names(catalogSuggestions("hack", ["  hack squat  "]));
    expect(out).not.toContain("Hack Squat");
  });

  it("browses from the top when the query is empty", () => {
    const out = catalogSuggestions("", []);
    expect(out.length).toBe(8);
    expect(out[0]).toEqual(EXERCISE_CATALOG[0]);
  });

  it("caps the number of suggestions", () => {
    expect(catalogSuggestions("press", []).length).toBeLessThanOrEqual(8);
    expect(catalogSuggestions("press", [], 3).length).toBe(3);
  });

  it("returns nothing when the query matches no catalog entry", () => {
    expect(catalogSuggestions("zercher goblet nonsense", [])).toEqual([]);
  });

  it("carries the bodyweight-plus flag through for weighted lifts", () => {
    const [pullUps] = catalogSuggestions("Pull-Ups", []).filter(
      (e) => e.name === "Pull-Ups"
    );
    expect(pullUps.isBodyweightPlus).toBe(true);
  });
});
