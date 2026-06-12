import { describe, it, expect } from "vitest";
import {
  restSecondsFor,
  suggestIncrement,
  isReadyToIncrease,
  allSetsHitTop,
  topSetWeight,
  detectPlateau,
  computeTrainingWeek,
  isDeloadWeek,
  deloadAdjust,
  type LoggedSet,
  type RepRange,
} from "./progression";

const rx: RepRange = { targetSets: 3, repMin: 10, repMax: 12 };
const sets = (reps: number[], weight = 20): LoggedSet[] =>
  reps.map((r) => ({ weightKg: weight, reps: r }));

describe("rest + increment by type", () => {
  it("compound rests longer and jumps more", () => {
    expect(restSecondsFor("compound")).toBe(150);
    expect(suggestIncrement("compound")).toEqual({ min: 2.5, max: 5 });
  });
  it("isolation rests less and jumps less", () => {
    expect(restSecondsFor("isolation")).toBe(90);
    expect(suggestIncrement("isolation")).toEqual({ min: 1, max: 2.5 });
  });
});

describe("topSetWeight", () => {
  it("returns the heaviest set, 0 when empty", () => {
    expect(topSetWeight(sets([12, 12], 30))).toBe(30);
    expect(
      topSetWeight([
        { weightKg: 20, reps: 10 },
        { weightKg: 25, reps: 8 },
      ])
    ).toBe(25);
    expect(topSetWeight([])).toBe(0);
  });
});

describe("isReadyToIncrease / allSetsHitTop", () => {
  it("ready when every target set hits the top of the range", () => {
    expect(isReadyToIncrease(sets([12, 12, 12]), rx)).toBe(true);
    expect(isReadyToIncrease(sets([13, 12, 14]), rx)).toBe(true);
  });
  it("not ready if any set is below the top", () => {
    expect(isReadyToIncrease(sets([12, 11, 12]), rx)).toBe(false);
  });
  it("not ready with fewer than the target number of sets", () => {
    expect(isReadyToIncrease(sets([12, 12]), rx)).toBe(false);
  });
  it("not ready with no sets", () => {
    expect(isReadyToIncrease([], rx)).toBe(false);
    expect(allSetsHitTop([], rx)).toBe(false);
  });
});

describe("detectPlateau", () => {
  // summaries are most-recent-first
  it("flags 3 consecutive stuck sessions at the same weight", () => {
    const res = detectPlateau([
      { weightKg: 40, hitTopOfRange: false },
      { weightKg: 40, hitTopOfRange: false },
      { weightKg: 40, hitTopOfRange: false },
    ]);
    expect(res.isPlateau).toBe(true);
    expect(res.weightKg).toBe(40);
    expect(res.consecutive).toBe(3);
  });
  it("does not flag if the most recent session hit the top", () => {
    const res = detectPlateau([
      { weightKg: 40, hitTopOfRange: true },
      { weightKg: 40, hitTopOfRange: false },
      { weightKg: 40, hitTopOfRange: false },
    ]);
    expect(res.isPlateau).toBe(false);
    expect(res.consecutive).toBe(0);
  });
  it("does not flag across a weight change", () => {
    const res = detectPlateau([
      { weightKg: 42.5, hitTopOfRange: false },
      { weightKg: 40, hitTopOfRange: false },
      { weightKg: 40, hitTopOfRange: false },
    ]);
    expect(res.isPlateau).toBe(false);
    expect(res.consecutive).toBe(1);
  });
  it("needs at least 3 sessions", () => {
    expect(
      detectPlateau([
        { weightKg: 40, hitTopOfRange: false },
        { weightKg: 40, hitTopOfRange: false },
      ]).isPlateau
    ).toBe(false);
  });
});

describe("training week + deload cadence", () => {
  const start = new Date(2026, 0, 1); // Jan 1 2026
  it("week 1 on the start day and within 6 days", () => {
    expect(computeTrainingWeek(start, new Date(2026, 0, 1))).toBe(1);
    expect(computeTrainingWeek(start, new Date(2026, 0, 7))).toBe(1);
  });
  it("rolls to week 2 after 7 days", () => {
    expect(computeTrainingWeek(start, new Date(2026, 0, 8))).toBe(2);
  });
  it("week 4 and 8 are deload weeks", () => {
    expect(computeTrainingWeek(start, new Date(2026, 0, 22))).toBe(4);
    expect(isDeloadWeek(4)).toBe(true);
    expect(isDeloadWeek(8)).toBe(true);
    expect(isDeloadWeek(1)).toBe(false);
    expect(isDeloadWeek(0)).toBe(false);
  });
});

describe("deloadAdjust", () => {
  it("halves the sets (rounded up) at a lighter load, keeping the rep range", () => {
    expect(deloadAdjust({ targetSets: 3, repMin: 8, repMax: 12 })).toEqual({
      targetSets: 2,
      repMin: 8,
      repMax: 12,
      loadFactor: 0.6,
    });
    expect(deloadAdjust({ targetSets: 4, repMin: 5, repMax: 8 }).targetSets).toBe(2);
    expect(deloadAdjust({ targetSets: 1, repMin: 10, repMax: 12 }).targetSets).toBe(1);
  });
});
