"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, KeyRound, Settings, RefreshCw, Scale } from "lucide-react";
import { useT } from "@/components/i18n/i18n-provider";

// Streams an AI grocery list + meal ideas from /api/nutrition/groceries,
// mirroring the coach chat's fetch + getReader() pattern and its graceful
// degradation: 503 → connect a provider, 400 → log a weigh-in first.
export function NutritionRecommendations() {
  const t = useT();
  const [output, setOutput] = useState("");
  const [constraint, setConstraint] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [state, setState] = useState<"idle" | "disabled" | "needsWeight">("idle");

  async function generate() {
    if (streaming) return;
    setOutput("");
    setStreaming(true);
    try {
      const res = await fetch("/api/nutrition/groceries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ constraint: constraint.trim() }),
      });

      if (res.status === 503) {
        setState("disabled");
        return;
      }
      if (res.status === 400) {
        setState("needsWeight");
        return;
      }
      if (!res.ok || !res.body) {
        setOutput(t.common.retry);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setOutput((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch {
      setOutput(t.common.connectionLost);
    } finally {
      setStreaming(false);
    }
  }

  if (state === "disabled") {
    return (
      <Card className="flex flex-col items-center gap-3 p-6 text-center">
        <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <KeyRound className="size-5" />
        </div>
        <div>
          <h2 className="font-medium">{t.nutrition.recsOffTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.nutrition.recsOffBody}
          </p>
        </div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          <Settings className="size-4" />
          {t.coach.openSettings}
        </Link>
      </Card>
    );
  }

  if (state === "needsWeight") {
    return (
      <Card className="flex flex-col items-center gap-3 p-6 text-center">
        <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Scale className="size-5" />
        </div>
        <div>
          <h2 className="font-medium">{t.nutrition.needsWeightTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.nutrition.needsWeightBody}
          </p>
        </div>
        <Link
          href="/bodyweight"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          <Scale className="size-4" />
          {t.nutrition.logBodyweight}
        </Link>
      </Card>
    );
  }

  const hasOutput = output.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {hasOutput && (
        <Card className="p-4 text-sm whitespace-pre-wrap break-words">
          {output ||
            (streaming ? (
              <span className="text-muted-foreground">
                {t.nutrition.planning}
              </span>
            ) : null)}
        </Card>
      )}

      <Input
        value={constraint}
        onChange={(e) => setConstraint(e.target.value)}
        placeholder={t.nutrition.constraintPlaceholder}
        className="h-11"
      />

      <Button onClick={generate} disabled={streaming} className="h-11 w-full gap-1.5">
        {streaming ? (
          <span className="text-muted-foreground">{t.nutrition.generating}</span>
        ) : hasOutput ? (
          <>
            <RefreshCw className="size-4" />
            {t.nutrition.regenerate}
          </>
        ) : (
          <>
            <Sparkles className="size-4" />
            {t.nutrition.generate}
          </>
        )}
      </Button>
    </div>
  );
}
