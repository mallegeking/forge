// The AI coach's knowledge layer. `buildCoachingBrief` turns the athlete's
// recent training into a compact, model-readable brief — built entirely from
// the pure progression functions in `@/lib/progression`, so the coach speaks
// the exact same language as the rest of the app (reps-first, then weight).
//
// Everything here is pure (no DB, no network) so it unit-tests like
// progression.ts and stays cheap to reason about. The DB gather lives in
// `getCoachingInput` (queries.ts); the streaming call lives in the route handler.

import {
  type ExerciseType,
  type LoggedSet,
  type RepRange,
  summarizeExerciseSession,
  detectPlateau,
  isReadyToIncrease,
  suggestIncrement,
} from "./progression";

/** One past session of an exercise, condensed to its logged sets. */
export type SnapshotSession = {
  performedAt: Date;
  sets: LoggedSet[];
};

/** Everything the coach knows about one exercise, most-recent session first. */
export type ExerciseSnapshot = {
  name: string;
  type: ExerciseType;
  injuryNote: string | null;
  /** Weighted-bodyweight lift — weights are ADDED load ("+7.5kg"). */
  isBodyweightPlus?: boolean;
  rx: RepRange;
  /** Most-recent session first. Exercises with no history are dropped. */
  sessions: SnapshotSession[];
};

export type CoachingSnapshot = {
  programName: string;
  weekNumber: number;
  isDeload: boolean;
  exercises: ExerciseSnapshot[];
};

// How many recent sessions per exercise to feed the model. The brief is for
// trend-spotting, not a full export — a handful of recent sessions is plenty
// and keeps the prompt (and cost) bounded.
const MAX_SESSIONS_PER_EXERCISE = 6;

export const COACH_SYSTEM_PROMPT = `You are Forge, the strength coach built into the athlete's training app. You speak directly to the athlete who logs their lifts here.

The app follows one progression rule, and so do you:
1. Reps first: aim to hit the TOP of the prescribed rep range on every working set.
2. Then weight: once every set reaches the top in a session, add load next time — compound lifts +2.5–5 kg, isolation +1–2.5 kg. Reps drop, then you climb the range again.
Every 4th training week is a deload — lighter loads and volume to recover.

You will be given the athlete's current data: the active program, the training week, and recent sessions per exercise with progression flags already computed (READY to add weight, PLATEAU, or still building reps).

How to coach:
- Ground every claim in the data provided. Never invent sessions, weights, or reps that aren't there. If history is thin, say so and give general guidance.
- Be specific and prescriptive: name the exercise and give concrete kg numbers ("add 2.5 kg to your top set of Bench Press").
- Honor injury notes — if an exercise is flagged, account for it and suggest caution or alternatives rather than just pushing load.
- On a PLATEAU, don't just say "add weight". Suggest a real break: a small double-progression nudge, a back-off set, a brief deload, rep-quality focus, or a swap.
- During a deload week, hold load back — do not tell the athlete to add weight.
- Keep it concise and skimmable (this is a phone). Lead with what matters most. Use short paragraphs or tight bullets. Warm, direct, no filler.
- When (and only when) your advice centres on ONE specific exercise whose recent numbers appear in the data, you may attach a compact lift card by writing, on its own line, exactly:
[[lift|<exercise name>|<current kg>|<suggested next kg>|<READY or PLATEAU or HOLD>|<recent per-session reps, oldest first, e.g. 10·10·9 → 10·10·10>]]
The numbers must come from the data provided — never invent them. At most one card per reply. Keep the status keyword in English; never mention or explain the card syntax in prose.`;

/** Render one session's sets compactly: "40kg 8/8/7", or per-set when weights vary. */
function formatSession(session: SnapshotSession, plus = false): string {
  const { sets } = session;
  if (sets.length === 0) return "—";
  const pre = plus ? "+" : "";
  const sameWeight = sets.every((s) => s.weightKg === sets[0].weightKg);
  if (sameWeight) {
    return `${pre}${sets[0].weightKg}kg ${sets.map((s) => s.reps).join("/")}`;
  }
  return sets.map((s) => `${pre}${s.weightKg}kg×${s.reps}`).join(", ");
}

/** YYYY-MM-DD, the only date granularity the coach needs. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** One line per exercise: prescription, recent sessions, and the progression flag. */
function formatExercise(ex: ExerciseSnapshot): string {
  const sessions = ex.sessions.slice(0, MAX_SESSIONS_PER_EXERCISE);
  const rx = ex.rx;
  const header =
    `${ex.name} (${ex.type}${ex.isBodyweightPlus ? ", bodyweight + added load" : ""}, target ${rx.targetSets}×${rx.repMin}–${rx.repMax})` +
    (ex.injuryNote ? ` [injury: ${ex.injuryNote}]` : "");

  const recent = sessions
    .map(
      (s) =>
        `${formatSession(s, ex.isBodyweightPlus)} on ${isoDate(s.performedAt)}`
    )
    .join("; ");

  // Progression flags, computed with the same functions the session UI uses.
  const latest = sessions[0];
  const summaries = sessions.map((s) => summarizeExerciseSession(s.sets, rx));
  const plateau = detectPlateau(summaries);
  const ready = isReadyToIncrease(latest.sets, rx);
  const inc = suggestIncrement(ex.type);

  let status: string;
  if (ready) {
    status = `READY to add weight (+${inc.min}–${inc.max}kg next session).`;
  } else if (plateau.isPlateau) {
    status = `PLATEAU — ${plateau.consecutive} sessions stuck at ${plateau.weightKg}kg without topping the rep range.`;
  } else {
    status = `Building reps toward the top of the range.`;
  }

  return `- ${header}\n    Recent (newest first): ${recent}\n    Status: ${status}`;
}

/**
 * Build the compact training brief handed to the model as context. Pure over
 * the snapshot — exercises with no logged sessions are omitted, and each
 * exercise is capped at the most recent ${MAX_SESSIONS_PER_EXERCISE} sessions.
 */
export function buildCoachingBrief(snap: CoachingSnapshot): string {
  const deload = snap.isDeload
    ? " (DELOAD week — reduce load and volume, keep it light)"
    : "";
  const head = `Program: ${snap.programName}. Training week ${snap.weekNumber}${deload}.`;

  const withHistory = snap.exercises.filter((ex) => ex.sessions.length > 0);
  if (withHistory.length === 0) {
    return `${head}\n\nNo sessions logged yet — give general guidance to get started with this program.`;
  }

  const body = withHistory.map(formatExercise).join("\n");
  return `${head}\n\nExercises (most-recent sessions first):\n${body}`;
}

// --- Proactive coach's note ------------------------------------------------
//
// A glanceable home-screen note the coach surfaces unprompted. It's derived
// from the same progression flags the brief uses — so it needs NO model call
// and costs nothing per page load. Output is structured (no prose): the UI
// renders it in the active language. Tapping through to /coach is where the
// model actually phrases advice.

/** An exercise that hit the top of its range everywhere — ready for more load. */
export type CoachNoteReady = { name: string; incMin: number; incMax: number };
/** An exercise stuck at the same load without topping the range. */
export type CoachNotePlateau = { name: string; sessions: number };

export type CoachNote = {
  ready: CoachNoteReady[];
  plateau: CoachNotePlateau[];
};

/**
 * Build the proactive note, or `null` when there's nothing actionable to say
 * (no history yet, a deload week — the home hero already flags that — or every
 * lift is still mid-progression). Ready and plateau are mutually exclusive per
 * exercise, mirroring the brief's "ready first" priority.
 */
export function buildCoachNote(snap: CoachingSnapshot): CoachNote | null {
  // During a deload the home hero already shows a banner, and we hold load
  // back — so a "ready to add weight" note would be the wrong message.
  if (snap.isDeload) return null;

  const ready: CoachNoteReady[] = [];
  const plateau: CoachNotePlateau[] = [];

  for (const ex of snap.exercises) {
    if (ex.sessions.length === 0) continue;
    const latest = ex.sessions[0];
    if (isReadyToIncrease(latest.sets, ex.rx)) {
      const inc = suggestIncrement(ex.type);
      ready.push({ name: ex.name, incMin: inc.min, incMax: inc.max });
      continue;
    }
    const summaries = ex.sessions.map((s) =>
      summarizeExerciseSession(s.sets, ex.rx),
    );
    const p = detectPlateau(summaries);
    if (p.isPlateau) plateau.push({ name: ex.name, sessions: p.consecutive });
  }

  if (ready.length === 0 && plateau.length === 0) return null;
  return { ready, plateau };
}
