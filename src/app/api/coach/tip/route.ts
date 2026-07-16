// Streaming endpoint for the live, per-exercise coach tip. Tips are normally
// PRE-GENERATED in one batched call when the session starts (see
// lib/session-tips.ts) and stored in `session_tips` — this route serves the
// stored tip on reloads and only asks the model itself when one is missing
// (or the athlete explicitly retries with `fresh: true`), persisting the
// result so the next reload is free. Server-only — provider keys never reach
// the browser. Gated behind the passcode by src/proxy.ts (matcher covers /api/*).
//
// With no provider configured it returns 503 and the session UI silently falls
// back to its instant rule-based "coach's read" line.

import { getSessionView, getSessionTip } from "@/lib/queries";
import {
  COACH_TIP_SYSTEM_PROMPT,
  TIP_STREAM_ERROR_SENTINEL,
  buildExerciseTipBrief,
} from "@/lib/coach";
import { getCoachProvider } from "@/lib/coach-config";
import { streamCoachWithRetry } from "@/lib/coach-stream";
import { coachStreamResponse } from "@/lib/coach-response";
import { buildTipInputForExercise } from "@/lib/session-tips";
import { saveSessionTip } from "@/lib/mutations";
import { getLocale } from "@/lib/i18n/server";
import { LANGUAGE_DIRECTIVE } from "@/lib/i18n/config";

// Reads the DB + env per request; never prerender.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const provider = await getCoachProvider();
  if (!provider) {
    return Response.json({ error: "coach_disabled" }, { status: 503 });
  }

  let body: { sessionId?: string; exerciseId?: string; fresh?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { sessionId, exerciseId, fresh } = body;
  if (!sessionId || !exerciseId) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  // Serve the stored tip when we have one — no model call, no quota.
  if (!fresh) {
    const stored = await getSessionTip(sessionId, exerciseId);
    if (stored) {
      return new Response(stored, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-store",
        },
      });
    }
  }

  const [view, locale] = await Promise.all([
    getSessionView(sessionId),
    getLocale(),
  ]);
  const ex = view?.exercises.find((e) => e.exerciseId === exerciseId);
  if (!view || !ex) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const input = await buildTipInputForExercise(view, ex);
  const brief = buildExerciseTipBrief(input);
  const system = `${COACH_TIP_SYSTEM_PROMPT}${LANGUAGE_DIRECTIVE[locale]}`;

  // Retries transient provider failures server-side; a failure before the
  // first token becomes a real HTTP error the session UI already treats as
  // transient-with-retry. A mid-stream break still signals in-band with the
  // NUL sentinel — the UI discards the partial tip and offers a retry.
  return coachStreamResponse(
    streamCoachWithRetry(provider, system, [{ role: "user", content: brief }]),
    {
      logTag: "coach/tip",
      midStreamText: TIP_STREAM_ERROR_SENTINEL,
      // Persist the finished tip so reloads (and the session view) get it
      // straight from the DB instead of re-asking the model.
      onComplete: async (text) => {
        const tip = text.trim();
        if (tip) await saveSessionTip(sessionId, exerciseId, tip);
      },
    }
  );
}
