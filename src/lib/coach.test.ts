import { describe, it, expect } from "vitest";
import {
  buildCoachingBrief,
  buildCoachNote,
  buildExerciseTipBrief,
  buildSessionTipsBrief,
  parseSessionTips,
  type CoachingSnapshot,
  type SnapshotSession,
  type ExerciseTipInput,
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
      // Tops the range on the SECOND session at 100kg → ready to add weight.
      {
        name: "Squat",
        type: "compound",
        injuryNote: null,
        rx: compound,
        sessions: [session(100, [8, 8, 8], 0), session(100, [8, 7, 7], 2)],
      },
      // Tops the range on the FIRST session at 60kg → consolidate, not ready.
      {
        name: "Deadlift",
        type: "compound",
        injuryNote: null,
        rx: compound,
        sessions: [session(60, [8, 8, 8], 0), session(55, [8, 8, 8], 2)],
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

  it("flags a ready-to-increase exercise (weight already confirmed)", () => {
    expect(brief).toContain("READY to add weight");
    expect(brief).toContain("Squat");
  });

  it("flags a first-session top as consolidate, not ready", () => {
    expect(brief).toContain("CONSOLIDATE");
    expect(brief).toContain("60kg");
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
    // Second session at 100kg tops the range → consolidation satisfied.
    sessions: [session(100, [8, 8, 8], 0), session(100, [7, 8, 7], 2)],
  };
  const consolidateEx = {
    name: "Deadlift",
    type: "compound" as const,
    injuryNote: null,
    rx: compound,
    // First session at a new weight tops the range → confirm, not ready.
    sessions: [session(80, [8, 8, 8], 0), session(75, [8, 8, 8], 2)],
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

  it("collects ready and plateaued lifts; consolidating lifts stay quiet", () => {
    const note = buildCoachNote({
      programName: "PPL",
      weekNumber: 2,
      isDeload: false,
      exercises: [readyEx, consolidateEx, plateauEx, buildingEx],
    });
    expect(note).not.toBeNull();
    expect(note!.ready.map((r) => r.name)).toEqual(["Squat"]); // no Deadlift
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

describe("buildCoachingBrief — athlete notes", () => {
  it("carries the athlete's latest session note into the brief", () => {
    const brief = buildCoachingBrief({
      programName: "PPL",
      weekNumber: 1,
      isDeload: false,
      exercises: [
        {
          name: "Row",
          type: "compound",
          injuryNote: null,
          rx: compound,
          sessions: [session(60, [7, 7, 7], 0)],
          lastNote: { note: "grip gave out first", performedAt: new Date(2026, 5, 4) },
        },
      ],
    });
    // Date rendering is UTC-based (isoDate) — assert structure, not the day.
    expect(brief).toMatch(
      /Athlete's note \(2026-06-\d{2}\): "grip gave out first"/
    );
  });
});

describe("buildExerciseTipBrief — consolidation + notes", () => {
  const base: ExerciseTipInput = {
    name: "Bench Press",
    type: "compound",
    injuryNote: null,
    rx: compound,
    isDeload: false,
    recent: [],
    currentSets: [],
  };
  const rec = (weightKg: number, hit: boolean, daysAgo: number) => ({
    performedAt: new Date(2026, 5, 6 - daysAgo),
    topWeightKg: weightKg,
    topReps: 8,
    totalSets: 3,
    hitTopOfRange: hit,
  });

  it("marks a first-session top as CONSOLIDATE", () => {
    const brief = buildExerciseTipBrief({
      ...base,
      recent: [rec(50, true, 0), rec(47.5, true, 2)],
    });
    expect(brief).toContain("CONSOLIDATE");
    expect(brief).not.toContain("READY");
  });

  it("marks a confirmed weight as READY", () => {
    const brief = buildExerciseTipBrief({
      ...base,
      recent: [rec(50, true, 0), rec(50, false, 2)],
    });
    expect(brief).toContain("READY to add weight");
  });

  it("includes the athlete's prior note", () => {
    const brief = buildExerciseTipBrief({
      ...base,
      lastNote: { note: "shoulder felt off", performedAt: new Date(2026, 5, 4) },
    });
    expect(brief).toContain('"shoulder felt off"');
  });

  // Regression: the deload tip used to say only "keep it light", so the model
  // prescribed the full working weight from history ("stick to 30 kg") while
  // the session card showed the computed 17.5 kg target right above it.
  it("quotes the computed deload target weight and halved sets", () => {
    const brief = buildExerciseTipBrief({
      ...base,
      rx: { targetSets: 4, repMin: 8, repMax: 10 },
      isDeload: true,
      recent: [rec(30, true, 7), rec(27.5, true, 9)],
    });
    expect(brief).toContain("DELOAD week — today's target: 17.5kg");
    expect(brief).toContain("2×8–10"); // halved sets, in header and status
    expect(brief).toContain("target 2×8–10"); // header shows adjusted rx
    expect(brief).toContain("never the normal working weight");
  });

  it("keeps the generic deload cue when there is no history to anchor on", () => {
    const brief = buildExerciseTipBrief({ ...base, isDeload: true });
    expect(brief).toContain("DELOAD week — keep the load light");
  });
});

describe("session tips batch protocol", () => {
  const input = (name: string): ExerciseTipInput => ({
    name,
    type: "compound",
    injuryNote: null,
    rx: compound,
    isDeload: false,
    recent: [],
    currentSets: [],
  });

  it("numbers each exercise block and asks for a numbered reply", () => {
    const brief = buildSessionTipsBrief([input("Squat"), input("Bench Press")]);
    expect(brief).toContain("1. Exercise: Squat");
    expect(brief).toContain("2. Exercise: Bench Press");
    expect(brief).toContain("numbered 1–2");
    // The single-tip trailing instruction must not leak into the batch brief.
    expect(brief).not.toContain("Give one cue for this exercise now");
  });

  it("parses numbered lines back into per-exercise tips", () => {
    const tips = parseSessionTips(
      "1. Squat cue here.\n2) Bench cue here.\n\nsome stray prose",
      3
    );
    expect(tips).toEqual(["Squat cue here.", "Bench cue here.", null]);
  });

  it("keeps the first occurrence and ignores out-of-range numbers", () => {
    const tips = parseSessionTips("1. first\n1. duplicate\n9. out of range", 2);
    expect(tips).toEqual(["first", null]);
  });
});
