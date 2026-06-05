import { describe, it, expect } from "vitest";
import { weeklyAverages, bodyweightTrend, type BodyweightEntry } from "./bodyweight";

// Mon 2026-06-01 .. Sun 2026-06-07 is one ISO week; the next week starts 2026-06-08.
const entry = (weightKg: number, y: number, m: number, d: number): BodyweightEntry => ({
  weightKg,
  measuredAt: new Date(y, m - 1, d),
});

describe("weeklyAverages", () => {
  it("averages weigh-ins within each week, oldest first", () => {
    const points = weeklyAverages([
      entry(80, 2026, 6, 1), // week A (Mon)
      entry(81, 2026, 6, 3), // week A
      entry(79.5, 2026, 6, 8), // week B (next Mon)
    ]);
    expect(points).toHaveLength(2);
    expect(points[0].avgWeightKg).toBe(80.5); // (80 + 81) / 2
    expect(points[0].count).toBe(2);
    expect(points[1].avgWeightKg).toBe(79.5);
    expect(points[1].count).toBe(1);
    expect(points[0].weekStart.getTime()).toBeLessThan(points[1].weekStart.getTime());
  });

  it("groups Sunday with the week that started the prior Monday", () => {
    const points = weeklyAverages([
      entry(70, 2026, 6, 1), // Mon
      entry(72, 2026, 6, 7), // Sun, same week
    ]);
    expect(points).toHaveLength(1);
    expect(points[0].avgWeightKg).toBe(71);
  });

  it("rounds to one decimal", () => {
    const points = weeklyAverages([entry(80, 2026, 6, 1), entry(81, 2026, 6, 2), entry(81, 2026, 6, 3)]);
    expect(points[0].avgWeightKg).toBe(80.7); // 242/3 = 80.666…
  });

  it("returns nothing for no entries", () => {
    expect(weeklyAverages([])).toEqual([]);
  });
});

describe("bodyweightTrend", () => {
  it("is the change from the first to the latest weekly average", () => {
    const points = weeklyAverages([
      entry(82, 2026, 6, 1),
      entry(80, 2026, 6, 8),
      entry(79, 2026, 6, 15),
    ]);
    expect(bodyweightTrend(points)).toBe(-3); // 79 - 82
  });

  it("is null with fewer than two weeks", () => {
    expect(bodyweightTrend(weeklyAverages([entry(80, 2026, 6, 1)]))).toBeNull();
    expect(bodyweightTrend([])).toBeNull();
  });
});
