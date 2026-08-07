import { describe, it, expect } from "vitest";
import {
  restSecondsFor,
  suggestIncrement,
  isReadyToIncrease,
  readinessToIncrease,
  allSetsHitTop,
  topSetWeight,
  detectPlateau,
  computeTrainingWeek,
  isDeloadWeek,
  resolveDeload,
  deloadAdjust,
  deloadTargetWeightKg,
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

describe("readinessToIncrease (consolidation rule)", () => {
  // summaries are most-recent-first
  const s = (weightKg: number, hitTopOfRange: boolean) => ({
    weightKg,
    hitTopOfRange,
  });

  it("is 'first' with no history", () => {
    expect(readinessToIncrease([])).toBe("first");
  });

  it("is 'building' when the latest session misses the top", () => {
    expect(readinessToIncrease([s(50, false), s(50, true)])).toBe("building");
  });

  it("is 'consolidate' when the FIRST session at a weight tops the range", () => {
    expect(readinessToIncrease([s(50, true), s(47.5, true)])).toBe("consolidate");
    // No prior session at all counts as first-at-this-weight too.
    expect(readinessToIncrease([s(50, true)])).toBe("consolidate");
  });

  it("is 'ready' once the weight was held for 2+ sessions and tops the range", () => {
    expect(readinessToIncrease([s(50, true), s(50, false)])).toBe("ready");
    expect(readinessToIncrease([s(50, true), s(50, true), s(47.5, true)])).toBe(
      "ready"
    );
  });

  it("weight tenure counts only the consecutive run at the latest weight", () => {
    // 50 → back down to 47.5 → back up to 50: the return to 50 starts over.
    expect(readinessToIncrease([s(50, true), s(47.5, true), s(50, true)])).toBe(
      "consolidate"
    );
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
  // Weeks are Monday-aligned: they follow the program's calendar layout, not
  // the start date's own weekday. Jan 5 2026 is a Monday.
  const monday = new Date(2026, 0, 5);
  it("week 1 spans the start's Monday through Sunday", () => {
    expect(computeTrainingWeek(monday, new Date(2026, 0, 5))).toBe(1);
    expect(computeTrainingWeek(monday, new Date(2026, 0, 11))).toBe(1); // Sun
  });
  it("rolls to week 2 on the next Monday", () => {
    expect(computeTrainingWeek(monday, new Date(2026, 0, 12))).toBe(2);
  });
  it("snaps a mid-week start back to its Monday", () => {
    const friday = new Date(2026, 0, 9); // same week as Jan 5
    // Friday and Saturday of the start week are still week 1…
    expect(computeTrainingWeek(friday, new Date(2026, 0, 9))).toBe(1);
    expect(computeTrainingWeek(friday, new Date(2026, 0, 10))).toBe(1);
    // …and the following Monday is week 2, NOT day 3 of week 1. This is what
    // keeps a deload week from straddling two program weeks.
    expect(computeTrainingWeek(friday, new Date(2026, 0, 12))).toBe(2);
  });
  it("week 4 and 8 are deload weeks", () => {
    expect(computeTrainingWeek(monday, new Date(2026, 0, 26))).toBe(4);
    expect(isDeloadWeek(4)).toBe(true);
    expect(isDeloadWeek(8)).toBe(true);
    expect(isDeloadWeek(1)).toBe(false);
    expect(isDeloadWeek(0)).toBe(false);
  });
  it("resolveDeload honors a skipped week, then resumes cadence", () => {
    expect(resolveDeload(4, null)).toBe(true);
    expect(resolveDeload(4, "4")).toBe(false); // skipped this one
    expect(resolveDeload(5, "4")).toBe(false);
    expect(resolveDeload(8, "4")).toBe(true); // cadence resumes
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

describe("deloadTargetWeightKg", () => {
  it("takes 60% of the top weight, rounded to the nearest 2.5kg step", () => {
    expect(deloadTargetWeightKg(30)).toBe(17.5); // 18 → nearest plate step
    expect(deloadTargetWeightKg(100)).toBe(60);
    expect(deloadTargetWeightKg(42.5)).toBe(25);
    expect(deloadTargetWeightKg(0)).toBe(0);
  });
});
