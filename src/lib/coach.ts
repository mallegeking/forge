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
  readinessToIncrease,
  suggestIncrement,
  deloadAdjust,
  deloadTargetWeightKg,
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
  /** The athlete's most recent free-text note on this exercise, if any. */
  lastNote?: { note: string; performedAt: Date } | null;
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

/**
 * In-band failure marker for the streaming tip endpoint. Once the 200 headers
 * are out, a mid-stream provider error can only be signalled in the body — the
 * route appends this NUL character and the session UI treats the whole tip as
 * failed (shows a localized error + retry instead of caching the partial text).
 */
export const TIP_STREAM_ERROR_SENTINEL = "\u0000";

export const COACH_SYSTEM_PROMPT = `You are Forge, the strength coach built into the athlete's training app. You speak directly to the athlete who logs their lifts here.

The app follows one progression rule, and so do you:
1. Reps first: aim to hit the TOP of the prescribed rep range on every working set.
2. Consolidate: a new weight is held for at least TWO sessions. Topping the range on the very first session at a weight means "confirm it once more next time", not "add load".
3. Then weight: once the range is topped after ≥2 sessions at that weight, add load next time — compound lifts +2.5–5 kg, isolation +1–2.5 kg. Reps drop, then you climb the range again.
Every 4th training week is a deload — lighter loads and volume to recover.

You will be given the athlete's current data: the active program, the training week, and recent sessions per exercise with progression flags already computed (READY to add weight, CONSOLIDATE at the current weight, PLATEAU, or still building reps).

How to coach:
- Ground every claim in the data provided. Never invent sessions, weights, or reps that aren't there. If history is thin, say so and give general guidance.
- Be specific and prescriptive: name the exercise and give concrete kg numbers ("add 2.5 kg to your top set of Bench Press").
- On CONSOLIDATE, never prescribe more weight — the goal is repeating the same load with the same (or cleaner) reps. Frame it positively: locking the weight in IS the progress.
- Honor injury notes — if an exercise is flagged, account for it and suggest caution or alternatives rather than just pushing load.
- Honor the athlete's own session notes when provided (e.g. "shoulder felt off", "grip gave out first") — adjust the advice to what they told you, and acknowledge it briefly so they know it was read.
- On a PLATEAU, don't just say "add weight". Suggest a real break: a small double-progression nudge, a back-off set, a brief deload, rep-quality focus, or a swap.
- During a deload week, hold load back — do not tell the athlete to add weight.
- Keep it concise and skimmable (this is a phone). Lead with what matters most. Use short paragraphs or tight bullets. Warm, direct, no filler.
- When (and only when) your advice centres on ONE specific exercise whose recent numbers appear in the data, you may attach a compact lift card by writing, on its own line, exactly:
[[lift|<exercise name>|<current weight>|<suggested next weight>|<READY or PLATEAU or HOLD>|<recent per-session reps, oldest first, e.g. 10·10·9 → 10·10·10>]]
The two weight fields are bare numbers in kg — digits only, no unit (write 57.5, not "57.5 kg"). The numbers must come from the data provided — never invent them. At most one card per reply. Keep the status keyword in English; never mention or explain the card syntax in prose.`;

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
  const summaries = sessions.map((s) => summarizeExerciseSession(s.sets, rx));
  const plateau = detectPlateau(summaries);
  const readiness = readinessToIncrease(summaries);
  const inc = suggestIncrement(ex.type);
  const topWeight = summaries[0]?.weightKg ?? 0;

  let status: string;
  if (readiness === "ready") {
    status = `READY to add weight (+${inc.min}–${inc.max}kg next session).`;
  } else if (readiness === "consolidate") {
    status = `CONSOLIDATE — topped the range on the FIRST session at ${ex.isBodyweightPlus ? "+" : ""}${topWeight}kg; confirm this weight once more before adding load.`;
  } else if (plateau.isPlateau) {
    status = `PLATEAU — ${plateau.consecutive} sessions stuck at ${plateau.weightKg}kg without topping the rep range.`;
  } else {
    status = `Building reps toward the top of the range.`;
  }

  const note = ex.lastNote
    ? `\n    Athlete's note (${isoDate(ex.lastNote.performedAt)}): "${ex.lastNote.note}"`
    : "";

  return `- ${header}\n    Recent (newest first): ${recent}\n    Status: ${status}${note}`;
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

// --- Per-exercise tip (live workout) ---------------------------------------
//
// A short, proactive cue the coach gives the moment the athlete lands on an
// exercise mid-workout. Same progression language as the brief, but scoped to
// ONE exercise and capped to 1–2 sentences. The DB gather + streaming call live
// in the /api/coach/tip route; this stays pure.

const TIP_SHARED_RULES = `The app's progression rule (yours too):
1. Reps first: hit the TOP of the prescribed rep range on every working set.
2. Consolidate: a new weight is held for at least TWO sessions — topping the range on the first session at a weight means "confirm it next time", never "add load".
3. Then weight: once the range is topped after ≥2 sessions at that weight, add load next time — compound +2.5–5 kg, isolation +1–2.5 kg.
Every 4th training week is a deload — lighter, don't add load.

Tip rules:
- 1–2 short sentences, ~30 words max per tip. No greeting, no preamble, no sign-off. Plain prose only — never use the [[lift|…]] card syntax.
- Be specific with kg/reps drawn from the data. Never invent numbers; if there's no history, say so and give a sensible starting cue.
- READY → name the exact target load. CONSOLIDATE → prescribe repeating the SAME load, framed as locking it in — never more weight. PLATEAU → suggest a real break (pause reps, a back-off set, rep-quality focus, a small nudge), not just "add weight". Building → focus on hitting the top of the rep range.
- Honor the injury note if present. If the athlete left a note last session ("shoulder felt off"), address it — that note is them talking to you.
- On a deload week the data states today's reduced target (weight and sets). Prescribe exactly that target — never the normal working weight, even though it appears in the recent history.`;

export const COACH_TIP_SYSTEM_PROMPT = `You are Forge, the strength coach built into the athlete's training app, speaking to them mid-workout as they start one exercise.

${TIP_SHARED_RULES}

You'll be given this ONE exercise's prescription, its recent sessions (with a progression flag already computed), and any sets already logged today. Give ONE concrete, actionable cue for THIS exercise, right now.`;

// --- Batched pre-generation (all tips at session start) ----------------------
//
// One model call generates every exercise's tip when a session begins, so tips
// are already waiting when the athlete reaches each exercise — and one call
// instead of N respects the provider's free-tier rate limits. Output protocol:
// strictly one numbered line per exercise, parsed by `parseSessionTips`.

export const COACH_TIPS_BATCH_SYSTEM_PROMPT = `You are Forge, the strength coach built into the athlete's training app. The athlete is about to start a workout; you write one short cue for EACH exercise on today's plan.

${TIP_SHARED_RULES}

You'll be given the numbered list of today's exercises, each with its prescription, recent sessions and a progression flag already computed.

Output format — follow it exactly:
- Reply with exactly one line per exercise: the exercise's number, a period, a space, then the tip. Example: "2. Same 50 kg as last time — make all three sets of 12 clean to lock it in."
- Keep the exercises in the given order, one line each, no extra lines, no headers, no blank lines, no other text.`;

/** Numbered multi-exercise brief for the batched session-start generation. */
export function buildSessionTipsBrief(inputs: ExerciseTipInput[]): string {
  const blocks = inputs.map((input, i) => {
    // Reuse the single-tip brief, minus its trailing instruction line.
    const single = buildExerciseTipBrief(input).replace(
      /\n\nGive one cue for this exercise now\.$/,
      ""
    );
    return `${i + 1}. ${single}`;
  });
  return `Today's exercises:\n\n${blocks.join("\n\n")}\n\nGive one cue per exercise, numbered 1–${inputs.length}.`;
}

/**
 * Parse the batch reply back into per-exercise tips. Tolerant of model drift:
 * unnumbered/extra lines are ignored, missing numbers stay null (the live
 * per-exercise endpoint fills those on demand). First occurrence wins.
 */
export function parseSessionTips(text: string, count: number): (string | null)[] {
  const tips: (string | null)[] = Array.from({ length: count }, () => null);
  for (const raw of text.split("\n")) {
    const m = raw.trim().match(/^(\d{1,2})[.)]\s+(.+)$/);
    if (!m) continue;
    const idx = Number.parseInt(m[1], 10) - 1;
    if (idx >= 0 && idx < count && tips[idx] === null) {
      tips[idx] = m[2].trim();
    }
  }
  return tips;
}

/** One prior session of an exercise, condensed (matches getExerciseHistory points). */
export type ExerciseTipSession = {
  performedAt: Date;
  topWeightKg: number;
  topReps: number;
  totalSets: number;
  hitTopOfRange: boolean;
};

export type ExerciseTipInput = {
  name: string;
  type: ExerciseType;
  isBodyweightPlus?: boolean;
  injuryNote: string | null;
  rx: RepRange;
  isDeload: boolean;
  /** Prior sessions of this exercise, most-recent first (current session excluded). */
  recent: ExerciseTipSession[];
  /** Sets already logged for this exercise in the CURRENT session (may be empty). */
  currentSets: LoggedSet[];
  /** The athlete's most recent prior free-text note on this exercise, if any. */
  lastNote?: { note: string; performedAt: Date } | null;
};

/** A focused, single-exercise brief for the live coach tip — pure over its input. */
export function buildExerciseTipBrief(input: ExerciseTipInput): string {
  const pre = input.isBodyweightPlus ? "+" : "";
  const rx = input.rx;
  // On a deload the header shows the adjusted prescription (halved sets) —
  // the same numbers the session card renders, so the model can't contradict it.
  const effSets = input.isDeload ? deloadAdjust(rx).targetSets : rx.targetSets;
  const header =
    `${input.name} (${input.type}${input.isBodyweightPlus ? ", bodyweight + added load" : ""}, target ${effSets}×${rx.repMin}–${rx.repMax})` +
    (input.injuryNote ? ` [injury: ${input.injuryNote}]` : "");

  const recent = input.recent.slice(0, MAX_SESSIONS_PER_EXERCISE);
  const recentLine = recent.length
    ? recent
        .map(
          (s) =>
            `${pre}${s.topWeightKg}kg ×${s.topReps} (${s.totalSets} sets, ${s.hitTopOfRange ? "hit top" : "below top"}) on ${isoDate(s.performedAt)}`
        )
        .join("; ")
    : "no prior sessions logged";

  const summaries = recent.map((s) => ({
    weightKg: s.topWeightKg,
    hitTopOfRange: s.hitTopOfRange,
  }));
  const plateau = detectPlateau(summaries);
  const readiness = readinessToIncrease(summaries);
  const last = recent[0];
  const inc = suggestIncrement(input.type);

  let status: string;
  if (input.isDeload) {
    // Quote the app's computed deload target (same helper the session card
    // uses) — without it the model would "stick to" the full working weight,
    // contradicting the "Target today" line rendered right above the tip.
    status = last
      ? `DELOAD week — today's target: ${pre}${deloadTargetWeightKg(last.topWeightKg)}kg (~60% of the usual ${pre}${last.topWeightKg}kg) for ${effSets}×${rx.repMin}–${rx.repMax}. Prescribe exactly this reduced load and set count — never the normal working weight.`
      : "DELOAD week — keep the load light; do not push for more weight.";
  } else if (!last) {
    status =
      "First time logged here — establish a working weight and aim for the top of the rep range.";
  } else if (readiness === "ready") {
    status = `READY to add weight: +${inc.min}–${inc.max}kg over ${pre}${last.topWeightKg}kg.`;
  } else if (readiness === "consolidate") {
    status = `CONSOLIDATE — topped the range on the FIRST session at ${pre}${last.topWeightKg}kg; repeat this weight to lock it in before adding load.`;
  } else if (plateau.isPlateau) {
    status = `PLATEAU — ${plateau.consecutive} sessions stuck at ${pre}${plateau.weightKg}kg without topping the rep range.`;
  } else {
    status =
      "Building reps toward the top of the range — match or beat last time's reps.";
  }

  const note = input.lastNote
    ? `\nAthlete's note (${isoDate(input.lastNote.performedAt)}): "${input.lastNote.note}"`
    : "";

  const current = input.currentSets.length
    ? `\nLogged so far today: ${input.currentSets
        .map((s) => `${pre}${s.weightKg}kg×${s.reps}`)
        .join(", ")}.`
    : "";

  return `Exercise: ${header}\nRecent (newest first): ${recentLine}\nStatus: ${status}${note}${current}\n\nGive one cue for this exercise now.`;
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
    const summaries = ex.sessions.map((s) =>
      summarizeExerciseSession(s.sets, ex.rx),
    );
    // Consolidation-aware: a first session at a new weight that tops the range
    // is NOT "ready" — the note stays quiet about it (confirm first).
    if (readinessToIncrease(summaries) === "ready") {
      const inc = suggestIncrement(ex.type);
      ready.push({ name: ex.name, incMin: inc.min, incMax: inc.max });
      continue;
    }
    const p = detectPlateau(summaries);
    if (p.isPlateau) plateau.push({ name: ex.name, sessions: p.consecutive });
  }

  if (ready.length === 0 && plateau.length === 0) return null;
  return { ready, plateau };
}
