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
  buildExerciseTipBrief,
  type ExerciseTipSession,
} from "@/lib/coach";
import { getCoachProvider } from "@/lib/coach-config";
import { streamCoach } from "@/lib/coach-stream";
import { getLocale, getDict } from "@/lib/i18n/server";
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

  const [view, history, locale, t] = await Promise.all([
    getSessionView(sessionId),
    getExerciseHistory(exerciseId),
    getLocale(),
    getDict(),
  ]);

  const ex = view?.exercises.find((e) => e.exerciseId === exerciseId);
  if (!view || !ex) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // Prior sessions of this exercise (exclude the current one), most-recent first.
  const recent: ExerciseTipSession[] = (history?.points ?? [])
    .filter((p) => p.sessionId !== sessionId)
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

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamCoach(provider, system, [
          { role: "user", content: brief },
        ])) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
        // 200 headers are already sent — surface a readable note in-stream.
        console.error("[coach/tip] stream error", err);
        controller.enqueue(encoder.encode(t.common.aiStreamError));
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
