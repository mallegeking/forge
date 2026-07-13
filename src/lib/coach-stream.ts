// The actual streaming call to whichever provider `resolveCoachProvider` chose.
// `streamCoach` yields plain text deltas; the route encodes them into the HTTP
// stream. Anthropic goes through its native SDK; everyone else speaks the
// OpenAI-compatible /chat/completions SSE shape over plain fetch (no extra deps).

import Anthropic from "@anthropic-ai/sdk";
import type { CoachProvider } from "./coach-provider";

export type CoachMessage = { role: "user" | "assistant"; content: string };

// --- Error classification ---------------------------------------------------
//
// Provider failures used to surface as one generic "hit an error" note, so a
// rate limit (wait!), an overload blip (retry now) and a revoked key (fix
// settings) all looked identical — and the retry button refired straight into
// the same 429 window. Classifying here lets the routes return real HTTP
// errors and the UI give the right advice.

export type CoachErrorReason =
  | "rate_limited"
  | "overloaded"
  | "auth"
  | "network"
  | "other";

export class CoachStreamError extends Error {
  readonly reason: CoachErrorReason;
  readonly status?: number;
  /** Provider-suggested wait (Retry-After header / Gemini retryDelay). */
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    reason: CoachErrorReason,
    opts: { status?: number; retryAfterSeconds?: number; cause?: unknown } = {}
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "CoachStreamError";
    this.reason = reason;
    this.status = opts.status;
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}

function reasonForStatus(status: number): CoachErrorReason {
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "auth";
  if (status === 408 || status >= 500) return "overloaded";
  return "other";
}

/**
 * The wait the provider asked for, in seconds: the standard Retry-After
 * header, or Gemini's `"retryDelay": "22s"` inside the 429 error body.
 */
function parseRetryAfter(header: string | null, body: string): number | undefined {
  const fromHeader = header ? Number.parseFloat(header) : NaN;
  if (Number.isFinite(fromHeader) && fromHeader >= 0) return fromHeader;
  const m = body.match(/"retryDelay"\s*:\s*"([\d.]+)s"/);
  if (m) return Number.parseFloat(m[1]);
  return undefined;
}

/** Normalize any thrown value (SDK errors, fetch failures) into a CoachStreamError. */
export function toCoachStreamError(err: unknown): CoachStreamError {
  if (err instanceof CoachStreamError) return err;
  if (err instanceof Anthropic.APIError) {
    const status = typeof err.status === "number" ? err.status : 0;
    return new CoachStreamError(
      `anthropic returned ${status}: ${err.message.slice(0, 300)}`,
      status ? reasonForStatus(status) : "network",
      { status: status || undefined, cause: err }
    );
  }
  // fetch/undici network failures surface as TypeError("fetch failed").
  if (err instanceof TypeError) {
    return new CoachStreamError(`provider unreachable: ${err.message}`, "network", {
      cause: err,
    });
  }
  return new CoachStreamError(
    err instanceof Error ? err.message : String(err),
    "other",
    { cause: err }
  );
}

// --- Retry wrapper ------------------------------------------------------------

const RETRYABLE: ReadonlySet<CoachErrorReason> = new Set([
  "rate_limited",
  "overloaded",
  "network",
]);
const MAX_ATTEMPTS = 3;
// Waits longer than this aren't worth holding the request open for — fail
// fast with retryAfterSeconds so the UI can show an honest countdown instead.
const MAX_WAIT_SECONDS = 8;

/**
 * streamCoach with transparent retries for transient provider failures (429 /
 * 5xx / network), honoring the provider's suggested wait. Only failures BEFORE
 * the first delta are retried — retrying mid-stream would duplicate text.
 * Rethrows a classified CoachStreamError when retries are exhausted or the
 * failure isn't transient.
 */
export async function* streamCoachWithRetry(
  provider: CoachProvider,
  system: string,
  messages: CoachMessage[]
): AsyncGenerator<string> {
  for (let attempt = 1; ; attempt++) {
    let yielded = false;
    try {
      for await (const chunk of streamCoach(provider, system, messages)) {
        yielded = true;
        yield chunk;
      }
      return;
    } catch (err) {
      const cerr = toCoachStreamError(err);
      if (yielded || attempt >= MAX_ATTEMPTS || !RETRYABLE.has(cerr.reason)) {
        throw cerr;
      }
      const wait = cerr.retryAfterSeconds ?? attempt * 1.5;
      if (wait > MAX_WAIT_SECONDS) throw cerr;
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
}

// Generous cap: reasoning models (e.g. Gemini 2.5) count their hidden
// thinking against max_tokens — 2048 left replies truncated mid-sentence
// once the training brief made the model think long. Billing follows actual
// usage, not the cap.
const MAX_TOKENS = 8192;

export async function* streamCoach(
  provider: CoachProvider,
  system: string,
  messages: CoachMessage[]
): AsyncGenerator<string> {
  if (provider.kind === "anthropic") {
    yield* streamAnthropic(provider, system, messages);
  } else {
    yield* streamOpenAICompatible(provider, system, messages);
  }
}

async function* streamAnthropic(
  provider: Extract<CoachProvider, { kind: "anthropic" }>,
  system: string,
  messages: CoachMessage[]
): AsyncGenerator<string> {
  const client = new Anthropic({ apiKey: provider.apiKey });
  const stream = client.messages.stream({
    model: provider.model,
    max_tokens: MAX_TOKENS,
    system,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    messages,
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

async function* streamOpenAICompatible(
  provider: Extract<CoachProvider, { kind: "openai" }>,
  system: string,
  messages: CoachMessage[]
): AsyncGenerator<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${provider.apiKey}`,
  };
  if (provider.referer) headers["HTTP-Referer"] = provider.referer;
  if (provider.title) headers["X-Title"] = provider.title;

  const url = `${provider.baseURL.replace(/\/+$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: provider.model,
      stream: true,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new CoachStreamError(
      `coach provider "${provider.provider}" returned ${res.status}: ${detail.slice(0, 300)}`,
      reasonForStatus(res.status),
      {
        status: res.status,
        retryAfterSeconds: parseRetryAfter(res.headers.get("retry-after"), detail),
      }
    );
  }

  // Parse Server-Sent Events line by line, yielding each delta's content.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  function* drainLine(line: string): Generator<string> {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (data === "[DONE]") return;
    try {
      const json = JSON.parse(data);
      const delta = json?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) yield delta;
    } catch {
      // keep-alive comment or a split frame — ignore
    }
  }

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      yield* drainLine(line);
    }
  }

  // Some providers end the stream without a trailing newline on the final
  // frame — drain what's left in the buffer or the last delta is lost.
  buffer += decoder.decode();
  for (const raw of buffer.split("\n")) {
    yield* drainLine(raw.trim());
  }
}
