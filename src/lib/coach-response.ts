// Shared HTTP plumbing for the three model-streaming routes (coach chat,
// per-exercise tip, groceries). The key move: await the FIRST delta before
// committing to a 200, so provider failures — by far most common before any
// token arrives (429 rate limit, 503 overload, bad key) — become real HTTP
// errors the client can distinguish and react to, instead of apology text
// inside a "successful" stream. Only a failure mid-stream still degrades
// in-band, via the route's `midStreamText`.

import { CoachStreamError, toCoachStreamError } from "./coach-stream";

/** JSON body of a coach error response — the client switches on `error`. */
export type CoachErrorBody = {
  error: string;
  retryAfterSeconds: number | null;
};

export function coachErrorResponse(err: unknown): Response {
  const cerr = err instanceof CoachStreamError ? err : toCoachStreamError(err);
  const retryAfterSeconds = cerr.retryAfterSeconds ?? null;
  const status = cerr.reason === "rate_limited" ? 429 : 502;
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (retryAfterSeconds != null) {
    headers["Retry-After"] = String(Math.ceil(retryAfterSeconds));
  }
  const body: CoachErrorBody = { error: cerr.reason, retryAfterSeconds };
  return Response.json(body, { status, headers });
}

export async function coachStreamResponse(
  stream: AsyncGenerator<string>,
  { logTag, midStreamText }: { logTag: string; midStreamText: string }
): Promise<Response> {
  let first: IteratorResult<string, void>;
  try {
    first = await stream.next();
  } catch (err) {
    console.error(`[${logTag}] provider error`, err);
    return coachErrorResponse(err);
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done) controller.enqueue(encoder.encode(first.value));
        for (let next = await stream.next(); !next.done; next = await stream.next()) {
          controller.enqueue(encoder.encode(next.value));
        }
        controller.close();
      } catch (err) {
        // The 200 headers are already sent — degrade in-band.
        console.error(`[${logTag}] mid-stream error`, err);
        controller.enqueue(encoder.encode(midStreamText));
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
