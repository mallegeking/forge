"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import {
  saveCoachSettingsAction,
  testCoachAction,
  disconnectCoachAction,
} from "@/app/actions";
import type { CoachSettingsView } from "@/lib/coach-config";

const PROVIDERS = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "gemini", label: "Gemini" },
  { id: "openai", label: "OpenAI" },
  { id: "custom", label: "Custom" },
] as const;

const MODEL_HINT: Record<string, string> = {
  anthropic: "claude-sonnet-4-6",
  openrouter: "anthropic/claude-sonnet-4.6",
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
  custom: "your-model-id",
};

type Notice = { tone: "ok" | "err" | "info"; text: string };

export function CoachSettingsForm({ current }: { current: CoachSettingsView }) {
  const [provider, setProvider] = useState(current.provider);
  const [model, setModel] = useState(current.model);
  const [baseUrl, setBaseUrl] = useState(current.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [testing, setTesting] = useState(false);
  const [pending, startTransition] = useTransition();

  const keyKnown = current.hasKey || apiKey.trim().length > 0;
  const canSave =
    !!provider &&
    keyKnown &&
    (provider !== "custom" || baseUrl.trim().length > 0) &&
    !pending;

  const save = () =>
    startTransition(async () => {
      await saveCoachSettingsAction({ provider, model, baseUrl, apiKey });
      setApiKey("");
      setNotice({ tone: "info", text: "Saved. Hit Test to verify the connection." });
    });

  const test = async () => {
    setTesting(true);
    setNotice(null);
    try {
      const r = await testCoachAction();
      setNotice({ tone: r.ok ? "ok" : "err", text: r.message });
    } finally {
      setTesting(false);
    }
  };

  const disconnect = () =>
    startTransition(async () => {
      await disconnectCoachAction();
      setProvider("");
      setModel("");
      setBaseUrl("");
      setApiKey("");
      setNotice({ tone: "info", text: "Disconnected. Falls back to .env.local if set." });
    });

  return (
    <Card className="gap-4 p-4">
      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Provider
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PROVIDERS.map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant={provider === p.id ? "default" : "outline"}
              onClick={() => setProvider(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">API key</span>
        <Input
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={
            current.hasKey ? "•••••••• saved — leave blank to keep" : "Paste your API key"
          }
          className="h-11"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">
          Model <span className="text-muted-foreground/70">(optional)</span>
        </span>
        <Input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={provider ? MODEL_HINT[provider] : "provider default"}
          className="h-11"
        />
      </label>

      {provider === "custom" && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Base URL</span>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://your-gateway/v1"
            className="h-11"
          />
        </label>
      )}

      {notice && (
        <div
          className={`flex items-center gap-2 rounded-lg p-2.5 text-xs ${
            notice.tone === "ok"
              ? "bg-success/10 text-success"
              : notice.tone === "err"
                ? "bg-destructive/10 text-destructive"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {notice.tone === "ok" ? (
            <CheckCircle2 className="size-4 shrink-0" />
          ) : notice.tone === "err" ? (
            <XCircle className="size-4 shrink-0" />
          ) : null}
          <span className="break-words">{notice.text}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" onClick={save} disabled={!canSave} className="flex-1">
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={test}
          disabled={testing || pending}
          className="gap-1"
        >
          {testing && <Loader2 className="size-3.5 animate-spin" />}
          Test
        </Button>
        {(current.hasKey || current.provider) && (
          <Button
            type="button"
            variant="ghost"
            onClick={disconnect}
            disabled={pending}
            className="text-destructive hover:text-destructive"
          >
            Disconnect
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Stored locally in your app database. Overrides any provider key in{" "}
        <code className="rounded bg-muted px-1 py-0.5">.env.local</code>.
      </p>
    </Card>
  );
}
