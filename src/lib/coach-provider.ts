// Which LLM backs the coach is configured by env, so the app works with
// Anthropic (default), OpenRouter, Gemini, OpenAI, or any OpenAI-compatible
// gateway — and degrades gracefully (returns null) when no key is set.
//
// Claude keeps its NATIVE SDK path (`kind: "anthropic"`); every other provider
// speaks the OpenAI-compatible /chat/completions shape (`kind: "openai"`). The
// actual calls live in coach-stream.ts. This module is pure (env in → config
// out) so it unit-tests without a network.

export type CoachProvider =
  | { kind: "anthropic"; apiKey: string; model: string }
  | {
      kind: "openai";
      /** The concrete provider behind the OpenAI-compatible shape, for errors/logs. */
      provider: "openrouter" | "gemini" | "openai" | "custom";
      apiKey: string;
      baseURL: string;
      model: string;
      referer?: string;
      title?: string;
    };

export type ProviderName = "anthropic" | "openrouter" | "gemini" | "openai" | "custom";

const ORDER: ProviderName[] = ["anthropic", "openrouter", "gemini", "openai", "custom"];

const DEFAULT_MODEL: Record<ProviderName, string> = {
  anthropic: "claude-sonnet-4-6",
  openrouter: "anthropic/claude-sonnet-4.6",
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
  custom: "", // custom has no sensible default — COACH_MODEL is required
};

const DEFAULT_BASE_URL: Record<Exclude<ProviderName, "anthropic" | "custom">, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/",
  openai: "https://api.openai.com/v1",
};

type Env = Record<string, string | undefined>;

const clean = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

/** The dedicated key for a provider, with COACH_API_KEY as a shared fallback. */
function keyFor(provider: ProviderName, env: Env): string | undefined {
  const dedicated = {
    anthropic: env.ANTHROPIC_API_KEY,
    openrouter: env.OPENROUTER_API_KEY,
    gemini: env.GEMINI_API_KEY,
    openai: env.OPENAI_API_KEY,
    custom: undefined,
  }[provider];
  return clean(dedicated) ?? clean(env.COACH_API_KEY);
}

/** True when a provider's *own* key is present — used for auto-detection only. */
function hasDedicatedKey(provider: ProviderName, env: Env): boolean {
  switch (provider) {
    case "anthropic":
      return !!clean(env.ANTHROPIC_API_KEY);
    case "openrouter":
      return !!clean(env.OPENROUTER_API_KEY);
    case "gemini":
      return !!clean(env.GEMINI_API_KEY);
    case "openai":
      return !!clean(env.OPENAI_API_KEY);
    case "custom":
      // Custom is "configured" only when the endpoint + key + model are all set.
      return !!(clean(env.COACH_BASE_URL) && clean(env.COACH_API_KEY) && clean(env.COACH_MODEL));
  }
}

function build(provider: ProviderName, env: Env): CoachProvider | null {
  const apiKey = keyFor(provider, env);
  const model = clean(env.COACH_MODEL) ?? DEFAULT_MODEL[provider];

  if (provider === "anthropic") {
    if (!apiKey) return null;
    return { kind: "anthropic", apiKey, model };
  }

  if (provider === "custom") {
    const baseURL = clean(env.COACH_BASE_URL);
    // A custom OpenAI-compatible endpoint needs all three — no defaults to fall back on.
    if (!apiKey || !baseURL || !model) return null;
    return { kind: "openai", provider, apiKey, baseURL, model, ...labels(env) };
  }

  if (!apiKey) return null;
  const baseURL = clean(env.COACH_BASE_URL) ?? DEFAULT_BASE_URL[provider];
  return { kind: "openai", provider, apiKey, baseURL, model, ...labels(env) };
}

// OpenRouter reads these optional attribution headers; harmless elsewhere.
function labels(env: Env): { referer?: string; title?: string } {
  return { referer: clean(env.COACH_REFERER), title: clean(env.COACH_TITLE) ?? "Forge" };
}

/**
 * Resolve the coach provider from env. An explicit `COACH_PROVIDER` wins;
 * otherwise the first provider with its own key configured is used (in the
 * order anthropic → openrouter → gemini → openai → custom). Returns null when
 * nothing is configured, which the route surfaces as a friendly disabled state.
 */
export function resolveCoachProvider(env: Env = process.env): CoachProvider | null {
  const explicit = clean(env.COACH_PROVIDER)?.toLowerCase();
  if (explicit) {
    if ((ORDER as string[]).includes(explicit)) return build(explicit as ProviderName, env);
    return null; // unknown provider name
  }
  for (const provider of ORDER) {
    if (hasDedicatedKey(provider, env)) {
      const resolved = build(provider, env);
      if (resolved) return resolved;
    }
  }
  return null;
}
