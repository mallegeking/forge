// Streaming endpoint for AI grocery + meal recommendations. Reuses the coach's
// provider/stream layer (getCoachProvider / streamCoach), but with a nutrition
// system prompt and a brief built from the athlete's targets + training. Streams
// the recommendation back as plain-text deltas, exactly like /api/coach.
//
// Already gated behind the passcode by src/proxy.ts (matcher covers /api/*).
// With no provider key it degrades to a 503 and the UI shows a disabled state;
// with no bodyweight logged yet it returns 400 (can't compute targets).

import { getCoachingInput } from "@/lib/queries";
import { buildCoachingBrief } from "@/lib/coach";
import { getCoachProvider } from "@/lib/coach-config";
import { getNutritionConfig } from "@/lib/nutrition-config";
import { NUTRITION_SYSTEM_PROMPT, buildNutritionBrief } from "@/lib/nutrition";
import { streamCoach, type CoachMessage } from "@/lib/coach-stream";
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
          "Recommendations need an AI provider. Connect one in Settings (or set a provider key in .env.local).",
      },
      { status: 503 }
    );
  }

  const { config, latestWeightKg, weightTrendKg, targets } =
    await getNutritionConfig();
  if (!targets || latestWeightKg == null) {
    return Response.json(
      {
        error: "no_bodyweight",
        message: "Log a weigh-in first so we can compute your targets.",
      },
      { status: 400 }
    );
  }

  // Optional free-text constraint for this run (e.g. "vegetarian this week").
  let constraint = "";
  try {
    const body = (await request.json()) as { constraint?: unknown };
    if (typeof body.constraint === "string") constraint = body.constraint.trim();
  } catch {
    // No body / bad JSON — just generate from the saved config.
  }

  // Training context reuses the coach's brief (pure, no extra model call).
  const [snapshot, locale, t] = await Promise.all([
    getCoachingInput(),
    getLocale(),
    getDict(),
  ]);
  const trainingSummary = snapshot ? buildCoachingBrief(snapshot) : null;

  const brief = buildNutritionBrief({
    targets,
    goal: config.goal,
    activity: config.activity,
    weightKg: latestWeightKg,
    weightTrendKg,
    trainingSummary,
    preferences: config.preferences || null,
  });
  const system = `${NUTRITION_SYSTEM_PROMPT}\n\nAthlete's data:\n${brief}${LANGUAGE_DIRECTIVE[locale]}`;

  const ask =
    "Generate this week's grocery list and 2–3 meal ideas that hit my targets." +
    (constraint ? ` Extra constraint for this week: ${constraint}` : "");
  const messages: CoachMessage[] = [{ role: "user", content: ask }];

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamCoach(provider, system, messages)) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
        // 200 headers are already sent — surface a readable note in-stream.
        console.error("[nutrition] stream error", err);
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
