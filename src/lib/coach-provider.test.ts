import { describe, it, expect } from "vitest";
import { resolveCoachProvider } from "./coach-provider";

describe("resolveCoachProvider — auto-detection", () => {
  it("returns null when nothing is configured", () => {
    expect(resolveCoachProvider({})).toBeNull();
  });

  it("prefers Anthropic and defaults to Sonnet", () => {
    const p = resolveCoachProvider({ ANTHROPIC_API_KEY: "sk-ant" });
    expect(p).toEqual({ kind: "anthropic", apiKey: "sk-ant", model: "claude-sonnet-4-6" });
  });

  it("anthropic wins over openrouter when both keys are present", () => {
    const p = resolveCoachProvider({
      ANTHROPIC_API_KEY: "sk-ant",
      OPENROUTER_API_KEY: "sk-or",
    });
    expect(p?.kind).toBe("anthropic");
  });

  it("falls through to OpenRouter with its base URL + default model", () => {
    const p = resolveCoachProvider({ OPENROUTER_API_KEY: "sk-or" });
    expect(p).toMatchObject({
      kind: "openai",
      provider: "openrouter",
      apiKey: "sk-or",
      baseURL: "https://openrouter.ai/api/v1",
      model: "anthropic/claude-sonnet-4.6",
    });
  });

  it("detects Gemini via its OpenAI-compatible endpoint", () => {
    const p = resolveCoachProvider({ GEMINI_API_KEY: "g-key" });
    expect(p).toMatchObject({
      kind: "openai",
      provider: "gemini",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      model: "gemini-2.5-flash",
    });
  });
});

describe("resolveCoachProvider — explicit COACH_PROVIDER", () => {
  it("honors an explicit provider even if another key is present", () => {
    const p = resolveCoachProvider({
      COACH_PROVIDER: "openrouter",
      ANTHROPIC_API_KEY: "sk-ant",
      OPENROUTER_API_KEY: "sk-or",
    });
    expect(p?.kind).toBe("openai");
    expect(p).toMatchObject({ provider: "openrouter", apiKey: "sk-or" });
  });

  it("lets a named provider borrow COACH_API_KEY when its own key is absent", () => {
    const p = resolveCoachProvider({ COACH_PROVIDER: "openai", COACH_API_KEY: "shared" });
    expect(p).toMatchObject({ kind: "openai", provider: "openai", apiKey: "shared" });
  });

  it("returns null for an unknown provider name", () => {
    expect(resolveCoachProvider({ COACH_PROVIDER: "bogus", ANTHROPIC_API_KEY: "x" })).toBeNull();
  });

  it("returns null when the selected provider has no key", () => {
    expect(resolveCoachProvider({ COACH_PROVIDER: "gemini" })).toBeNull();
  });
});

describe("resolveCoachProvider — overrides", () => {
  it("COACH_MODEL overrides the provider default", () => {
    const p = resolveCoachProvider({ ANTHROPIC_API_KEY: "x", COACH_MODEL: "claude-opus-4-8" });
    expect(p).toMatchObject({ model: "claude-opus-4-8" });
  });

  it("custom requires base URL + key + model together", () => {
    expect(
      resolveCoachProvider({ COACH_PROVIDER: "custom", COACH_API_KEY: "k" })
    ).toBeNull(); // missing base URL + model
    const p = resolveCoachProvider({
      COACH_PROVIDER: "custom",
      COACH_API_KEY: "k",
      COACH_BASE_URL: "https://llm.local/v1",
      COACH_MODEL: "local-model",
    });
    expect(p).toMatchObject({
      kind: "openai",
      provider: "custom",
      baseURL: "https://llm.local/v1",
      model: "local-model",
    });
  });

  it("auto-detects a fully-configured custom endpoint last", () => {
    const p = resolveCoachProvider({
      COACH_API_KEY: "k",
      COACH_BASE_URL: "https://llm.local/v1",
      COACH_MODEL: "local-model",
    });
    expect(p).toMatchObject({ kind: "openai", provider: "custom" });
  });
});
