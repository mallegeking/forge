import { describe, it, expect } from "vitest";
import {
  buildCoachingBrief,
  buildCoachNote,
  type CoachingSnapshot,
  type SnapshotSession,
} from "./coach";
import type { RepRange } from "./progression";

const compound: RepRange = { targetSets: 3, repMin: 6, repMax: 8 };
const isolation: RepRange = { targetSets: 3, repMin: 10, repMax: 12 };

// daysAgo 0 = newest; sessions are passed most-recent-first.
const session = (
  weightKg: number,
  reps: number[],
  daysAgo = 0
): SnapshotSession => ({
  performedAt: new Date(2026, 5, 6 - daysAgo),
  sets: reps.map((r) => ({ weightKg, reps: r })),
});

describe("buildCoachingBrief — header", () => {
  it("names the program, training week, and flags a deload week", () => {
    const brief = buildCoachingBrief({
      programName: "PPL",
      weekNumber: 4,
      isDeload: true,
      exercises: [],
    });
    expect(brief).toContain("PPL");
    expect(brief).toContain("week 4");
    expect(brief).toContain("DELOAD");
  });

  it("falls back to a get-started message when nothing is logged", () => {
    const brief = buildCoachingBrief({
      programName: "PPL",
      weekNumber: 1,
      isDeload: false,
      exercises: [
        {
          name: "Bench Press",
          type: "compound",
          injuryNote: null,
          rx: compound,
          sessions: [],
        },
      ],
    });
    expect(brief).toContain("No sessions logged yet");
    // An exercise with no history is omitted entirely.
    expect(brief).not.toContain("Bench Press");
  });
});

describe("buildCoachingBrief — progression flags", () => {
  const snap: CoachingSnapshot = {
    programName: "PPL",
    weekNumber: 2,
    isDeload: false,
    exercises: [
      // Latest session tops the range on every set → ready to add weight.
      {
        name: "Squat",
        type: "compound",
        injuryNote: null,
        rx: compound,
        sessions: [session(100, [8, 8, 8], 0)],
      },
      // Three sessions stuck at 40kg below the top → plateau.
      {
        name: "Bench Press",
        type: "compound",
        injuryNote: null,
        rx: compound,
        sessions: [
          session(40, [7, 7, 6], 0),
          session(40, [7, 7, 6], 2),
          session(40, [6, 7, 6], 4),
        ],
      },
    ],
  };
  const brief = buildCoachingBrief(snap);

  it("flags a ready-to-increase exercise", () => {
    expect(brief).toContain("READY to add weight");
    expect(brief).toContain("Squat");
  });

  it("flags a plateau at the stuck weight", () => {
    expect(brief).toContain("PLATEAU");
    expect(brief).toContain("40kg");
  });
});

describe("buildCoachingBrief — bounded session history", () => {
  it("keeps only the most recent sessions per exercise", () => {
    // 8 sessions, newest first; the oldest uses a unique 1kg weight.
    const weights = [20, 19, 18, 17, 16, 15, 14, 1];
    const brief = buildCoachingBrief({
      programName: "X",
      weekNumber: 1,
      isDeload: false,
      exercises: [
        {
          name: "Curl",
          type: "isolation",
          injuryNote: null,
          rx: isolation,
          sessions: weights.map((w, i) => session(w, [10, 10, 10], i)),
        },
      ],
    });
    expect(brief).toContain("20kg"); // newest survives
    expect(brief).not.toContain("1kg"); // oldest (beyond the cap) is dropped
  });
});

describe("buildCoachNote", () => {
  const readyEx = {
    name: "Squat",
    type: "compound" as const,
    injuryNote: null,
    rx: compound,
    sessions: [session(100, [8, 8, 8], 0)],
  };
  const plateauEx = {
    name: "Bench Press",
    type: "compound" as const,
    injuryNote: null,
    rx: compound,
    sessions: [
      session(40, [7, 7, 6], 0),
      session(40, [7, 7, 6], 2),
      session(40, [6, 7, 6], 4),
    ],
  };
  const buildingEx = {
    name: "Row",
    type: "compound" as const,
    injuryNote: null,
    rx: compound,
    sessions: [session(60, [6, 6, 6], 0)],
  };

  it("collects ready and plateaued lifts", () => {
    const note = buildCoachNote({
      programName: "PPL",
      weekNumber: 2,
      isDeload: false,
      exercises: [readyEx, plateauEx, buildingEx],
    });
    expect(note).not.toBeNull();
    expect(note!.ready.map((r) => r.name)).toEqual(["Squat"]);
    expect(note!.ready[0].incMin).toBeGreaterThan(0);
    expect(note!.plateau).toEqual([{ name: "Bench Press", sessions: 3 }]);
  });

  it("returns null on a deload week (the hero already flags it)", () => {
    const note = buildCoachNote({
      programName: "PPL",
      weekNumber: 4,
      isDeload: true,
      exercises: [readyEx, plateauEx],
    });
    expect(note).toBeNull();
  });

  it("returns null when nothing is actionable", () => {
    const note = buildCoachNote({
      programName: "PPL",
      weekNumber: 1,
      isDeload: false,
      exercises: [
        buildingEx,
        {
          name: "Curl",
          type: "isolation",
          injuryNote: null,
          rx: isolation,
          sessions: [], // no history → skipped
        },
      ],
    });
    expect(note).toBeNull();
  });
});

describe("buildCoachingBrief — injuries", () => {
  it("surfaces an injury note so the coach can account for it", () => {
    const brief = buildCoachingBrief({
      programName: "PPL",
      weekNumber: 1,
      isDeload: false,
      exercises: [
        {
          name: "Overhead Press",
          type: "compound",
          injuryNote: "left shoulder — keep volume moderate",
          rx: compound,
          sessions: [session(30, [8, 7, 7], 0)],
        },
      ],
    });
    expect(brief).toContain("injury: left shoulder");
  });
});
