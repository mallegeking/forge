// The actual streaming call to whichever provider `resolveCoachProvider` chose.
// `streamCoach` yields plain text deltas; the route encodes them into the HTTP
// stream. Anthropic goes through its native SDK; everyone else speaks the
// OpenAI-compatible /chat/completions SSE shape over plain fetch (no extra deps).

import Anthropic from "@anthropic-ai/sdk";
import type { CoachProvider } from "./coach-provider";

export type CoachMessage = { role: "user" | "assistant"; content: string };

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
    throw new Error(
      `coach provider "${provider.provider}" returned ${res.status}: ${detail.slice(0, 300)}`
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
