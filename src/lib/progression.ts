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

/**
 * Default rest for NEW exercises, by type. The Ember spec's finer tiers
 * (180s big compounds / 150s rows / 120s cable / 90s isolation) live as
 * per-exercise data — these are the mid-tier starting points.
 */
export function restSecondsFor(type: ExerciseType): number {
  return type === "compound" ? 150 : 90;
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

// --- Consolidation-aware readiness -------------------------------------------
//
// "Reps first, then weight" alone proved too eager: one good session at a new
// weight immediately produced READY, so every improvement was chased by "add
// more". The athlete asked for safe progress (2026-07-15): a new weight must
// be HELD for at least two sessions before the next increase. Topping the
// range on the very first session at a weight is a strong start — the answer
// is "confirm it once more", not "add load".

export type Readiness = "first" | "building" | "consolidate" | "ready";

/**
 * Readiness to add weight, judged over recent sessions of one exercise.
 *
 * - `first` — no history yet; establish a working weight.
 * - `building` — latest session didn't top the rep range; keep chasing reps.
 * - `consolidate` — latest session topped the range, but this is the first
 *   session at this weight; confirm it once more before adding load.
 * - `ready` — topped the range after ≥2 consecutive sessions at this weight.
 *
 * @param summaries Sessions for one exercise, most-recent-first, deload
 *   sessions excluded (their planned lighter load would reset the tenure).
 */
export function readinessToIncrease(
  summaries: ExerciseSessionSummary[]
): Readiness {
  if (summaries.length === 0) return "first";
  const latest = summaries[0];
  if (!latest.hitTopOfRange) return "building";
  let tenure = 1;
  for (
    let i = 1;
    i < summaries.length && summaries[i].weightKg === latest.weightKg;
    i++
  ) {
    tenure += 1;
  }
  return tenure >= 2 ? "ready" : "consolidate";
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

/**
 * 1-based training week number, counted from the first logged session — but
 * aligned to Monday-based calendar weeks, matching how the program lays out
 * its days (dayOfWeek 1–7) and how the home rail counts "this week".
 *
 * The old behavior anchored weeks to the start date's own weekday, so an
 * athlete who first trained on a Friday got Fri→Thu "weeks". A deload week
 * then straddled two program weeks: it deloaded the tail of one (Fri/Sat) and
 * the head of the next (Mon–Thu), skipping days and double-deloading exercises
 * shared across the boundary. Snapping the start to its Monday makes training
 * week === program week, so a deload covers each program day exactly once.
 */
export function computeTrainingWeek(startDate: Date, now: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const days = Math.floor(
    (startOfDay(now) - startOfMonday(startDate)) / msPerDay
  );
  if (days < 0) return 1;
  return Math.floor(days / 7) + 1;
}

/**
 * Whether the current week is a deload, honoring a postponed ("skipped")
 * deload: the setting records the week the athlete opted out of, and cadence
 * resumes on the next multiple of 4. Shared by the home banner, session
 * creation, and the coach snapshot so all three always agree.
 */
export function resolveDeload(
  week: number,
  postponedWeek: string | null
): boolean {
  return isDeloadWeek(week) && postponedWeek !== String(week);
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

const DELOAD_LOAD_FACTOR = 0.6;

/**
 * A deload week's prescription: roughly half the sets (rounded up) at a lighter
 * load, same rep range. Keeps recovery weeks structured rather than skipped.
 */
export function deloadAdjust(rx: RepRange): DeloadTarget {
  return {
    targetSets: Math.max(1, Math.ceil(rx.targetSets / 2)),
    repMin: rx.repMin,
    repMax: rx.repMax,
    loadFactor: DELOAD_LOAD_FACTOR,
  };
}

/**
 * The deload day's suggested working weight: the load factor applied to the
 * last normal top weight, rounded to the nearest 2.5 kg plate step. The single
 * source for this number — the session card, the stepper seed, and the AI
 * coach brief must all quote the same target.
 */
export function deloadTargetWeightKg(topWeightKg: number): number {
  return Math.max(0, Math.round((topWeightKg * DELOAD_LOAD_FACTOR) / 2.5) * 2.5);
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Midnight of the Monday of `d`'s ISO week. */
function startOfMonday(d: Date): number {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date.getTime();
}
