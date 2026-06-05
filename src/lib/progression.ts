// Progression rules for the training program. These are pure functions over
// logged-set data so they can be unit tested and reused everywhere — the
// session UI today, and the AI coach later — without touching the database.
//
// The system is reps-first, then weight:
//   1. Try to hit the top of the rep range on every set.
//   2. Once every set hits the top in one session, you're ready to add weight.
//   3. Add weight (compound +2.5–5kg, isolation +1–2.5kg); reps drop; repeat.

export type ExerciseType = "compound" | "isolation";

export type LoggedSet = {
  weightKg: number;
  reps: number;
};

export type RepRange = {
  targetSets: number;
  repMin: number;
  repMax: number;
};

/** Rest between sets. Compound lifts get 2–3 min, isolation 60–90s. */
export function restSecondsFor(type: ExerciseType): number {
  return type === "compound" ? 150 : 75;
}

/** Suggested weight jump once reps top out, in kg, by movement type. */
export function suggestIncrement(type: ExerciseType): { min: number; max: number } {
  return type === "compound" ? { min: 2.5, max: 5 } : { min: 1, max: 2.5 };
}

/** The heaviest weight used across a set of logs (0 if none). */
export function topSetWeight(sets: LoggedSet[]): number {
  return sets.reduce((max, s) => Math.max(max, s.weightKg), 0);
}

/** True when every working set reached the top of the prescribed rep range. */
export function allSetsHitTop(sets: LoggedSet[], rx: RepRange): boolean {
  if (sets.length < rx.targetSets) return false;
  return sets.every((s) => s.reps >= rx.repMax);
}

/**
 * Step 2 of the progression system: are all target sets at the top of the rep
 * range, so the user should add weight next session?
 */
export function isReadyToIncrease(sets: LoggedSet[], rx: RepRange): boolean {
  if (sets.length === 0) return false;
  return allSetsHitTop(sets, rx);
}

/** A one-session summary for one exercise, used for plateau detection. */
export type ExerciseSessionSummary = {
  weightKg: number;
  hitTopOfRange: boolean;
};

/** Condense a session's sets for an exercise into a plateau-detection summary. */
export function summarizeExerciseSession(
  sets: LoggedSet[],
  rx: RepRange
): ExerciseSessionSummary {
  return {
    weightKg: topSetWeight(sets),
    hitTopOfRange: allSetsHitTop(sets, rx),
  };
}

export type PlateauResult = {
  isPlateau: boolean;
  /** The stuck weight, when a plateau is detected. */
  weightKg: number | null;
  /** How many consecutive recent sessions are stuck at the same weight. */
  consecutive: number;
};

/**
 * A plateau is the same weight with a failure to hit the top of the rep range
 * for 3 consecutive sessions on the same exercise.
 *
 * @param summaries Sessions for one exercise, ordered most-recent-first.
 */
export function detectPlateau(
  summaries: ExerciseSessionSummary[],
  threshold = 3
): PlateauResult {
  if (summaries.length === 0) {
    return { isPlateau: false, weightKg: null, consecutive: 0 };
  }

  const stuckWeight = summaries[0].weightKg;
  let consecutive = 0;
  for (const s of summaries) {
    if (s.weightKg === stuckWeight && !s.hitTopOfRange) {
      consecutive++;
    } else {
      break;
    }
  }

  return {
    isPlateau: consecutive >= threshold,
    weightKg: consecutive >= threshold ? stuckWeight : null,
    consecutive,
  };
}

/** 1-based training week number, counted from the first logged session. */
export function computeTrainingWeek(startDate: Date, now: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const days = Math.floor((startOfDay(now) - startOfDay(startDate)) / msPerDay);
  if (days < 0) return 1;
  return Math.floor(days / 7) + 1;
}

/** Deload cadence: every 4th training week. */
export function isDeloadWeek(week: number): boolean {
  return week > 0 && week % 4 === 0;
}

export type DeloadTarget = {
  targetSets: number;
  repMin: number;
  repMax: number;
  /** Suggested fraction of normal working weight for the week. */
  loadFactor: number;
};

/**
 * A deload week's prescription: roughly half the sets (rounded up) at a lighter
 * load, same rep range. Keeps recovery weeks structured rather than skipped.
 */
export function deloadAdjust(rx: RepRange): DeloadTarget {
  return {
    targetSets: Math.max(1, Math.ceil(rx.targetSets / 2)),
    repMin: rx.repMin,
    repMax: rx.repMax,
    loadFactor: 0.6,
  };
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
