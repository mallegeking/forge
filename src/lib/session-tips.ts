// Server-side session-tip pipeline. Two consumers share the input assembly:
// the /api/coach/tip route (one exercise, on demand) and the batched
// pre-generation kicked off when a session starts — ONE model call writes
// every exercise's tip into `session_tips`, so tips are already waiting when
// the athlete reaches each exercise and a reload never re-asks the model.

import {
  getSessionView,
  getExerciseHistory,
  getLatestExerciseNote,
  type SessionView,
  type SessionExerciseView,
} from "./queries";
import {
  COACH_TIPS_BATCH_SYSTEM_PROMPT,
  buildSessionTipsBrief,
  parseSessionTips,
  type ExerciseTipInput,
} from "./coach";
import { getCoachProvider } from "./coach-config";
import { streamCoachWithRetry } from "./coach-stream";
import { saveSessionTip } from "./mutations";
import { LANGUAGE_DIRECTIVE, type Locale } from "./i18n/config";

/**
 * Assemble the pure tip-brief input for one exercise of a session — history,
 * progression context, and the athlete's most recent prior note.
 */
export async function buildTipInputForExercise(
  view: SessionView,
  ex: SessionExerciseView
): Promise<ExerciseTipInput> {
  const [history, lastNote] = await Promise.all([
    getExerciseHistory(ex.exerciseId),
    getLatestExerciseNote(ex.exerciseId, view.session.id),
  ]);

  // Prior sessions of this exercise (exclude the current one), most-recent
  // first. Deload sessions are skipped — the tip's READY/PLATEAU status must
  // read normal working sessions, not a planned ~60% recovery week.
  const recent = (history?.points ?? [])
    .filter((p) => p.sessionId !== view.session.id && !p.isDeload)
    .sort((a, b) => b.performedAt.getTime() - a.performedAt.getTime())
    .map((p) => ({
      performedAt: p.performedAt,
      topWeightKg: p.topWeightKg,
      topReps: p.topReps,
      totalSets: p.totalSets,
      hitTopOfRange: p.hitTopOfRange,
    }));

  return {
    name: ex.name,
    type: ex.type,
    isBodyweightPlus: ex.isBodyweightPlus,
    injuryNote: ex.injuryNote,
    rx: { targetSets: ex.targetSets, repMin: ex.repMin, repMax: ex.repMax },
    isDeload: view.session.isDeload,
    recent,
    currentSets: ex.loggedSets.map((s) => ({
      weightKg: s.weightKg,
      reps: s.reps,
    })),
    lastNote,
  };
}

/**
 * Generate and store tips for every exercise of a session that doesn't have
 * one yet, in a single batched model call. Runs detached after the session
 * starts (`after()` in the start action) — it must never throw into the
 * request, so every failure is logged and swallowed; the live per-exercise
 * endpoint fills any gaps on demand.
 */
export async function pregenerateSessionTips(
  sessionId: string,
  locale: Locale
): Promise<void> {
  try {
    const provider = await getCoachProvider();
    if (!provider) return;

    const view = await getSessionView(sessionId);
    if (!view) return;
    const missing = view.exercises.filter((e) => !e.tip);
    if (missing.length === 0) return;

    const inputs = await Promise.all(
      missing.map((ex) => buildTipInputForExercise(view, ex))
    );

    const system = `${COACH_TIPS_BATCH_SYSTEM_PROMPT}${LANGUAGE_DIRECTIVE[locale]}`;
    let out = "";
    for await (const chunk of streamCoachWithRetry(provider, system, [
      { role: "user", content: buildSessionTipsBrief(inputs) },
    ])) {
      out += chunk;
    }

    const tips = parseSessionTips(out, inputs.length);
    await Promise.all(
      tips.map((tip, i) =>
        tip ? saveSessionTip(sessionId, missing[i].exerciseId, tip) : undefined
      )
    );
  } catch (err) {
    console.error("[coach/tips] pregeneration failed", err);
  }
}
