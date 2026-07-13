// Streaming endpoint for the live, per-exercise coach tip. Given a session +
// exercise, it builds a focused single-exercise brief and streams a 1–2 sentence
// cue back as plain-text deltas. Server-only — provider keys never reach the
// browser. Gated behind the passcode by src/proxy.ts (matcher covers /api/*).
//
// With no provider configured it returns 503 and the session UI silently falls
// back to its instant rule-based "coach's read" line.

import { getSessionView, getExerciseHistory } from "@/lib/queries";
import {
  COACH_TIP_SYSTEM_PROMPT,
  TIP_STREAM_ERROR_SENTINEL,
  buildExerciseTipBrief,
  type ExerciseTipSession,
} from "@/lib/coach";
import { getCoachProvider } from "@/lib/coach-config";
import { streamCoachWithRetry } from "@/lib/coach-stream";
import { coachStreamResponse } from "@/lib/coach-response";
import { getLocale } from "@/lib/i18n/server";
import { LANGUAGE_DIRECTIVE } from "@/lib/i18n/config";

// Reads the DB + env per request; never prerender.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const provider = await getCoachProvider();
  if (!provider) {
    return Response.json({ error: "coach_disabled" }, { status: 503 });
  }

  let body: { sessionId?: string; exerciseId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { sessionId, exerciseId } = body;
  if (!sessionId || !exerciseId) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const [view, history, locale] = await Promise.all([
    getSessionView(sessionId),
    getExerciseHistory(exerciseId),
    getLocale(),
  ]);

  const ex = view?.exercises.find((e) => e.exerciseId === exerciseId);
  if (!view || !ex) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // Prior sessions of this exercise (exclude the current one), most-recent
  // first. Deload sessions are skipped — the tip's READY/PLATEAU status must
  // read normal working sessions, not a planned ~60% recovery week.
  const recent: ExerciseTipSession[] = (history?.points ?? [])
    .filter((p) => p.sessionId !== sessionId && !p.isDeload)
    .sort((a, b) => b.performedAt.getTime() - a.performedAt.getTime())
    .map((p) => ({
      performedAt: p.performedAt,
      topWeightKg: p.topWeightKg,
      topReps: p.topReps,
      totalSets: p.totalSets,
      hitTopOfRange: p.hitTopOfRange,
    }));

  const brief = buildExerciseTipBrief({
    name: ex.name,
    type: ex.type,
    isBodyweightPlus: ex.isBodyweightPlus,
    injuryNote: ex.injuryNote,
    rx: { targetSets: ex.targetSets, repMin: ex.repMin, repMax: ex.repMax },
    isDeload: view.session.isDeload,
    recent,
    currentSets: ex.loggedSets.map((s) => ({ weightKg: s.weightKg, reps: s.reps })),
  });

  const system = `${COACH_TIP_SYSTEM_PROMPT}${LANGUAGE_DIRECTIVE[locale]}`;

  // Retries transient provider failures server-side; a failure before the
  // first token becomes a real HTTP error the session UI already treats as
  // transient-with-retry. A mid-stream break still signals in-band with the
  // NUL sentinel — the UI discards the partial tip and offers a retry
  // (it must NOT cache the failure).
  return coachStreamResponse(
    streamCoachWithRetry(provider, system, [{ role: "user", content: brief }]),
    { logTag: "coach/tip", midStreamText: TIP_STREAM_ERROR_SENTINEL }
  );
}
