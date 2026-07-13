import { afterEach, describe, expect, it, vi } from "vitest";
import {
  streamCoachWithRetry,
  CoachStreamError,
  type CoachMessage,
} from "./coach-stream";
import type { CoachProvider } from "./coach-provider";

// Exercises the OpenAI-compatible path (the one Gemini uses) against a stubbed
// fetch: transient failures retry with the provider's suggested wait, terminal
// failures classify and throw once, mid-stream breaks never retry.

const provider: CoachProvider = {
  kind: "openai",
  provider: "gemini",
  apiKey: "test-key",
  baseURL: "https://example.test/v1",
  model: "test-model",
};

const messages: CoachMessage[] = [{ role: "user", content: "hi" }];

const sseOk = (...texts: string[]) =>
  new Response(
    [
      ...texts.map(
        (t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}`
      ),
      "data: [DONE]",
      "",
    ].join("\n"),
    { status: 200, headers: { "Content-Type": "text/event-stream" } }
  );

const collect = async () => {
  const out: string[] = [];
  for await (const chunk of streamCoachWithRetry(provider, "sys", messages)) {
    out.push(chunk);
  }
  return out;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamCoachWithRetry", () => {
  it("retries a 429 using the provider's retryDelay and then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: 429, details: [{ retryDelay: "0s" }] },
          }).replace('"retryDelay":"0s"', '"retryDelay": "0s"'),
          { status: 429 }
        )
      )
      .mockResolvedValueOnce(sseOk("Hello", " athlete"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(collect()).resolves.toEqual(["Hello", " athlete"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries an overloaded 503 (no wait hint ⇒ ~1.5s backoff)", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("model overloaded", { status: 503 }))
        .mockResolvedValueOnce(sseOk("ok"));
      vi.stubGlobal("fetch", fetchMock);

      const done = collect();
      await vi.advanceTimersByTimeAsync(1600);
      await expect(done).resolves.toEqual(["ok"]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry an auth failure and classifies it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("invalid key", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const err = await collect().catch((e) => e);
    expect(err).toBeInstanceOf(CoachStreamError);
    expect(err.reason).toBe("auth");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails fast on a long rate-limit wait, surfacing retryAfterSeconds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response("quota", { status: 429, headers: { "Retry-After": "30" } })
      );
    vi.stubGlobal("fetch", fetchMock);

    const err = await collect().catch((e) => e);
    expect(err).toBeInstanceOf(CoachStreamError);
    expect(err.reason).toBe("rate_limited");
    expect(err.retryAfterSeconds).toBe(30);
    expect(fetchMock).toHaveBeenCalledTimes(1); // waiting 30s inline is pointless
  });

  it("gives up after exhausting attempts on persistent 429s", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response("quota", { status: 429, headers: { "Retry-After": "0" } })
      );
    vi.stubGlobal("fetch", fetchMock);

    const err = await collect().catch((e) => e);
    expect(err.reason).toBe("rate_limited");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("never retries after text was already streamed", async () => {
    const encoder = new TextEncoder();
    let sent = false;
    const breakingBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ choices: [{ delta: { content: "partial" } }] })}\n`
            )
          );
        } else {
          controller.error(new Error("connection reset"));
        }
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(breakingBody, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const out: string[] = [];
    const err = await (async () => {
      try {
        for await (const chunk of streamCoachWithRetry(provider, "sys", messages)) {
          out.push(chunk);
        }
        return null;
      } catch (e) {
        return e;
      }
    })();

    expect(out).toEqual(["partial"]); // the partial text still reached the caller
    expect(err).toBeInstanceOf(CoachStreamError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("classifies network failures as retryable and recovers", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(sseOk("back"));
    vi.stubGlobal("fetch", fetchMock);

    vi.useFakeTimers();
    try {
      const done = collect();
      await vi.advanceTimersByTimeAsync(1600);
      await expect(done).resolves.toEqual(["back"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
