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
import { resolveCoachProvider } from "@/lib/coach-provider";
import { streamCoach, type CoachMessage } from "@/lib/coach-stream";

// Reads the DB + env per request; never prerender.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const provider = resolveCoachProvider();
  if (!provider) {
    return Response.json(
      {
        error: "coach_disabled",
        message:
          "The coach is off. Add a provider key (e.g. ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or GEMINI_API_KEY) to .env.local to enable it.",
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
  const snapshot = await getCoachingInput();
  const brief = snapshot
    ? buildCoachingBrief(snapshot)
    : "No active program is loaded yet — guide the athlete on getting set up.";
  const system = `${COACH_SYSTEM_PROMPT}\n\nAthlete's current data:\n${brief}`;

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamCoach(provider, system, messages)) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
        // The 200 headers are already sent, so we can't switch to an error
        // status — surface a readable note in-stream instead of a hard break.
        console.error("[coach] stream error", err);
        controller.enqueue(
          encoder.encode(
            "\n\n⚠️ The coach hit an error reaching the model. Please try again."
          )
        );
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
