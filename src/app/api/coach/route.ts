// Streaming endpoint for the AI coach. Reads the athlete's training, builds a
// compact brief, and streams the model's advice back as plain-text deltas.
// Server-only — provider keys never reach the browser.
//
// Already gated behind the passcode by src/proxy.ts (its matcher covers /api/*),
// so there's no auth to do here. The LLM provider is env-configured
// (Anthropic / OpenRouter / Gemini / OpenAI / custom); with no key set it
// degrades gracefully to a 503 and the UI shows a friendly disabled state.

import { getCoachingInput } from "@/lib/queries";
import { buildCoachingBrief, COACH_SYSTEM_PROMPT } from "@/lib/coach";
import { getCoachProvider } from "@/lib/coach-config";
import { streamCoachWithRetry, type CoachMessage } from "@/lib/coach-stream";
import { coachStreamResponse } from "@/lib/coach-response";
import { getLocale, getDict } from "@/lib/i18n/server";
import { LANGUAGE_DIRECTIVE } from "@/lib/i18n/config";

// Reads the DB + env per request; never prerender.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const provider = await getCoachProvider();
  if (!provider) {
    return Response.json(
      {
        error: "coach_disabled",
        message:
          "The coach is off. Connect a provider in Settings (or set a provider key in .env.local).",
      },
      { status: 503 }
    );
  }

  let body: { messages?: CoachMessage[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const messages = (body.messages ?? []).filter(
    (m): m is CoachMessage =>
      (m?.role === "user" || m?.role === "assistant") &&
      typeof m?.content === "string" &&
      m.content.trim().length > 0
  );
  if (messages.length === 0) {
    return Response.json({ error: "no_messages" }, { status: 400 });
  }

  // Build the brief from the active program. Pure data → no model call yet.
  const [snapshot, locale, t] = await Promise.all([
    getCoachingInput(),
    getLocale(),
    getDict(),
  ]);
  const brief = snapshot
    ? buildCoachingBrief(snapshot)
    : "No active program is loaded yet — guide the athlete on getting set up.";
  const system = `${COACH_SYSTEM_PROMPT}\n\nAthlete's current data:\n${brief}${LANGUAGE_DIRECTIVE[locale]}`;

  // Retries transient provider failures server-side; a failure before the
  // first token becomes a real HTTP error (429/502 + reason) instead of
  // apology text inside a 200 stream — see coach-response.ts.
  return coachStreamResponse(streamCoachWithRetry(provider, system, messages), {
    logTag: "coach",
    midStreamText: t.common.aiStreamError,
  });
}
