import { describe, it, expect } from "vitest";
import {
  weeklyVolume,
  consistency,
  prTimeline,
  exerciseBests,
  estimated1RmByExercise,
  epley1Rm,
  type StatsRow,
} from "./stats";

// Mon 2026-06-01 .. Sun 2026-06-07 is one week; the next week starts 2026-06-08.
const set = (
  opts: Partial<StatsRow> & { sessionId: string; y: number; m: number; d: number }
): StatsRow => ({
  sessionId: opts.sessionId,
  performedAt: new Date(opts.y, opts.m - 1, opts.d),
  exerciseId: opts.exerciseId ?? "squat",
  exerciseName: opts.exerciseName ?? "Squat",
  exerciseType: opts.exerciseType ?? "compound",
  isBodyweightPlus: opts.isBodyweightPlus,
  weightKg: opts.weightKg ?? 100,
  reps: opts.reps ?? 5,
});

describe("weeklyVolume", () => {
  it("sums weight × reps per week and splits by exercise type", () => {
    const points = weeklyVolume([
      set({ sessionId: "s1", y: 2026, m: 6, d: 1, weightKg: 100, reps: 5 }), // 500 compound
      set({ sessionId: "s1", y: 2026, m: 6, d: 1, weightKg: 20, reps: 10, exerciseId: "curl", exerciseType: "isolation" }), // 200 isolation
      set({ sessionId: "s2", y: 2026, m: 6, d: 8, weightKg: 100, reps: 5 }), // next week 500
    ]);
    expect(points).toHaveLength(2);
    expect(points[0].volumeKg).toBe(700);
    expect(points[0].compoundKg).toBe(500);
    expect(points[0].isolationKg).toBe(200);
    expect(points[1].volumeKg).toBe(500);
    expect(points[0].weekStart.getTime()).toBeLessThan(points[1].weekStart.getTime());
  });

  it("returns nothing for no rows", () => {
    expect(weeklyVolume([])).toEqual([]);
  });
});

describe("consistency", () => {
  it("counts unique sessions and averages over the tracked span", () => {
    const now = new Date(2026, 5, 15); // Mon of the 3rd week
    const c = consistency(
      [
        set({ sessionId: "s1", y: 2026, m: 6, d: 1 }),
        set({ sessionId: "s1", y: 2026, m: 6, d: 1, exerciseId: "curl" }), // same session
        set({ sessionId: "s2", y: 2026, m: 6, d: 3 }),
        set({ sessionId: "s3", y: 2026, m: 6, d: 15 }), // current week
      ],
      now
    );
    expect(c.totalSessions).toBe(3);
    expect(c.thisWeek).toBe(1);
    // Dense weeks incl. the skipped one: Jun 1 (2), Jun 8 (0), Jun 15 (1).
    expect(c.weeklyCounts.map((w) => w.count)).toEqual([2, 0, 1]);
    expect(c.avgPerWeek).toBe(1); // 3 sessions over 3 weeks
  });

  it("streaks consecutive weeks back from the current week", () => {
    const now = new Date(2026, 5, 15);
    const c = consistency(
      [
        set({ sessionId: "a", y: 2026, m: 6, d: 1 }), // week 1
        set({ sessionId: "b", y: 2026, m: 6, d: 8 }), // week 2
        set({ sessionId: "c", y: 2026, m: 6, d: 15 }), // week 3 (current)
      ],
      now
    );
    expect(c.currentWeekStreak).toBe(3);
  });

  it("keeps the streak alive when the current week is still empty", () => {
    const now = new Date(2026, 5, 15); // current week has no session yet
    const c = consistency(
      [
        set({ sessionId: "a", y: 2026, m: 6, d: 1 }),
        set({ sessionId: "b", y: 2026, m: 6, d: 8 }),
      ],
      now
    );
    expect(c.currentWeekStreak).toBe(2); // counts back from last week
  });

  it("breaks the streak on a missed week", () => {
    const now = new Date(2026, 5, 15);
    const c = consistency(
      [
        set({ sessionId: "a", y: 2026, m: 6, d: 1 }), // week 1
        // week 2 skipped
        set({ sessionId: "c", y: 2026, m: 6, d: 15 }), // current week
      ],
      now
    );
    expect(c.currentWeekStreak).toBe(1);
  });
});

describe("prTimeline", () => {
  it("emits a PR only when a session beats the prior best, first time excluded", () => {
    const prs = prTimeline([
      set({ sessionId: "s1", y: 2026, m: 6, d: 1, weightKg: 100, reps: 5 }), // first ever — not a PR
      set({ sessionId: "s2", y: 2026, m: 6, d: 8, weightKg: 100, reps: 5 }), // equal — not a PR
      set({ sessionId: "s3", y: 2026, m: 6, d: 15, weightKg: 105, reps: 3 }), // PR
    ]);
    expect(prs).toHaveLength(1);
    expect(prs[0].weightKg).toBe(105);
    expect(prs[0].exerciseName).toBe("Squat");
  });

  it("uses the top set within a session and orders events oldest-first", () => {
    const prs = prTimeline([
      set({ sessionId: "s1", y: 2026, m: 6, d: 1, weightKg: 100, reps: 5 }),
      set({ sessionId: "s2", y: 2026, m: 6, d: 8, weightKg: 90, reps: 5 }),
      set({ sessionId: "s2", y: 2026, m: 6, d: 8, weightKg: 110, reps: 2 }), // top set of s2 → PR
    ]);
    expect(prs).toHaveLength(1);
    expect(prs[0].weightKg).toBe(110);
  });
});

describe("exerciseBests", () => {
  it("deduplicates to one all-time best per exercise, freshest first", () => {
    const bests = exerciseBests([
      set({ sessionId: "s1", y: 2026, m: 6, d: 1, weightKg: 100, reps: 5 }),
      set({ sessionId: "s2", y: 2026, m: 6, d: 8, weightKg: 105, reps: 3 }), // squat PR
      set({ sessionId: "s3", y: 2026, m: 6, d: 15, weightKg: 100, reps: 8 }), // below best — ignored
      set({ sessionId: "s2", y: 2026, m: 6, d: 8, exerciseId: "curl", exerciseName: "Curl", weightKg: 20, reps: 10 }),
      set({ sessionId: "s3", y: 2026, m: 6, d: 15, exerciseId: "curl", exerciseName: "Curl", weightKg: 22.5, reps: 8 }), // curl PR
    ]);
    expect(bests).toHaveLength(2);
    expect(bests[0].exerciseName).toBe("Curl"); // freshest best (Jun 15) first
    expect(bests[0].weightKg).toBe(22.5);
    expect(bests[0].prCount).toBe(1);
    expect(bests[1].exerciseName).toBe("Squat");
    expect(bests[1].weightKg).toBe(105);
    expect(bests[1].reps).toBe(3);
    expect(bests[1].performedAt).toEqual(new Date(2026, 5, 8));
  });

  it("upgrades the best on more reps at equal weight without counting a weight PR", () => {
    const bests = exerciseBests([
      set({ sessionId: "s1", y: 2026, m: 6, d: 1, weightKg: 100, reps: 5 }),
      set({ sessionId: "s2", y: 2026, m: 6, d: 8, weightKg: 100, reps: 7 }),
    ]);
    expect(bests).toHaveLength(1);
    expect(bests[0].reps).toBe(7);
    expect(bests[0].performedAt).toEqual(new Date(2026, 5, 8));
    expect(bests[0].prCount).toBe(0); // same weight — not a weight PR
  });

  it("carries the bodyweight-plus flag through", () => {
    const bests = exerciseBests([
      set({ sessionId: "s1", y: 2026, m: 6, d: 1, isBodyweightPlus: true, weightKg: 5, reps: 8 }),
    ]);
    expect(bests[0].isBodyweightPlus).toBe(true);
  });
});

describe("estimated1RmByExercise", () => {
  it("computes Epley e1rm", () => {
    expect(epley1Rm(100, 0)).toBe(100);
    expect(epley1Rm(100, 30)).toBe(200);
  });

  it("takes the best e1rm per session and orders most-trained first", () => {
    const series = estimated1RmByExercise([
      // squat: 3 sets across 2 sessions
      set({ sessionId: "s1", y: 2026, m: 6, d: 1, exerciseId: "squat", exerciseName: "Squat", weightKg: 100, reps: 5 }),
      set({ sessionId: "s1", y: 2026, m: 6, d: 1, exerciseId: "squat", exerciseName: "Squat", weightKg: 90, reps: 12 }), // higher e1rm
      set({ sessionId: "s2", y: 2026, m: 6, d: 8, exerciseId: "squat", exerciseName: "Squat", weightKg: 110, reps: 3 }),
      // curl: 1 set
      set({ sessionId: "s1", y: 2026, m: 6, d: 1, exerciseId: "curl", exerciseName: "Curl", weightKg: 20, reps: 10 }),
    ]);
    expect(series).toHaveLength(2);
    expect(series[0].name).toBe("Squat"); // most sets first
    expect(series[0].points).toHaveLength(2); // one per session
    // session 1 best: 90×12 → 90*(1+12/30)=126 beats 100×5 (116.7)
    expect(series[0].points[0].e1rm).toBe(126);
  });
});
