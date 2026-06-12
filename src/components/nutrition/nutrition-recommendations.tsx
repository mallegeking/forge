"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, KeyRound, Settings, Scale } from "lucide-react";
import { useT } from "@/components/i18n/i18n-provider";

// The model is instructed (NUTRITION_SYSTEM_PROMPT) to open with structured
// staples — one "[[item|Chicken breast|23]]" line each — followed by the prose
// list + meal ideas. We render the items as the design's name-vs-density rows
// and the rest as prose; if the model skips the protocol, prose still works.

type GroceryItem = { name: string; gramsPer100: string };

const ITEM_RE = /\[\[item\|([^\]|]+)\|([^\]|]+)\]\]/g;

function parseGroceries(raw: string): { items: GroceryItem[]; prose: string } {
  // Hide a trailing, still-streaming token ("[[ite", "[[item|Chick…").
  const content = raw.replace(/\[\[[^\]]*$/, "");
  const items: GroceryItem[] = [];
  for (const m of content.matchAll(ITEM_RE)) {
    items.push({ name: m[1].trim(), gramsPer100: m[2].trim() });
  }
  const prose = content.replace(ITEM_RE, "").replace(/^\s+/, "").trimEnd();
  return { items, prose };
}

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
      <EmptyCard
        icon={<KeyRound className="size-5" />}
        title={t.nutrition.recsOffTitle}
        body={t.nutrition.recsOffBody}
        href="/settings"
        cta={t.coach.openSettings}
        ctaIcon={<Settings className="size-4" />}
      />
    );
  }

  if (state === "needsWeight") {
    return (
      <EmptyCard
        icon={<Scale className="size-5" />}
        title={t.nutrition.needsWeightTitle}
        body={t.nutrition.needsWeightBody}
        href="/bodyweight"
        cta={t.nutrition.logBodyweight}
        ctaIcon={<Scale className="size-4" />}
      />
    );
  }

  const hasOutput = output.length > 0 || streaming;
  const { items, prose } = parseGroceries(output);

  return (
    <div className="flex flex-col gap-2.5">
      {/* Section header with the accent refresh link */}
      <div className="flex items-center justify-between">
        <span className="font-semibold text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
          {t.nutrition.groceryHeading}
        </span>
        {hasOutput && (
          <button
            type="button"
            onClick={generate}
            disabled={streaming}
            className="font-semibold text-[11px] tracking-[0.12em] text-primary uppercase disabled:opacity-50"
          >
            {t.nutrition.refresh} ↻
          </button>
        )}
      </div>

      {/* Protein-dense staples as rows: name vs "23 G / 100 G" */}
      {items.length > 0 && (
        <div className="flex flex-col gap-2.5 py-1">
          {items.map((item, i) => (
            <div
              key={`${item.name}-${i}`}
              className="flex items-center justify-between gap-2.5"
            >
              <span className="min-w-0 truncate text-[14px] font-semibold">
                {item.name}
              </span>
              <span className="shrink-0 font-display text-[15px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                {item.gramsPer100} {t.nutrition.grams} / 100 {t.nutrition.grams}
              </span>
            </div>
          ))}
        </div>
      )}

      {hasOutput && (prose || items.length === 0) && (
        <div className="rounded-[14px] bg-card px-4 py-3.5 text-sm leading-relaxed whitespace-pre-wrap break-words">
          {prose || (
            <span className="text-muted-foreground">{t.nutrition.planning}</span>
          )}
        </div>
      )}

      <input
        value={constraint}
        onChange={(e) => setConstraint(e.target.value)}
        placeholder={t.nutrition.constraintPlaceholder}
        className="h-12 rounded-[13px] bg-card px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
      />

      {!hasOutput && (
        <button
          type="button"
          onClick={generate}
          disabled={streaming}
          className="flex h-[50px] w-full items-center justify-center gap-2.5 rounded-[12px] bg-primary text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          <Sparkles className="size-4" />
          <span className="font-display text-[17px] font-semibold tracking-[0.14em] uppercase">
            {streaming ? t.nutrition.generating : t.nutrition.generate}
          </span>
        </button>
      )}
    </div>
  );
}

function EmptyCard({
  icon,
  title,
  body,
  href,
  cta,
  ctaIcon,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  href: string;
  cta: string;
  ctaIcon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[16px] bg-card p-6 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl bg-foreground/[0.07] text-muted-foreground">
        {icon}
      </div>
      <div>
        <h2 className="font-medium">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 rounded-[11px] bg-primary px-3.5 py-2.5 text-sm font-medium text-primary-foreground"
      >
        {ctaIcon}
        {cta}
      </Link>
    </div>
  );
}
