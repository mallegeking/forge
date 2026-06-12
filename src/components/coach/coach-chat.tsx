"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, Send, KeyRound, Settings } from "lucide-react";
import { useT } from "@/components/i18n/i18n-provider";

type Msg = { role: "user" | "assistant"; content: string };

// --- Structured lift card --------------------------------------------------
//
// The coach may attach one compact lift card per reply by emitting a line like
//   [[lift|Lat Pulldown|57.5|60|READY|10·10·9 → 10·10·10 → 12·11·10]]
// (see COACH_SYSTEM_PROMPT). The renderer splits message text around complete
// tokens; a trailing token still being streamed is hidden until it closes.

type LiftCard = {
  name: string;
  from: string;
  to: string;
  status: string;
  history: string;
};

type Part = { kind: "text"; text: string } | { kind: "lift"; card: LiftCard };

const LIFT_RE = /\[\[lift\|([^\]]*)\]\]/g;

function parseCoachContent(raw: string): Part[] {
  // Hide a trailing, still-streaming token ("[[lif", "[[lift|Lat Pull…").
  const content = raw.replace(/\[\[[^\]]*$/, "");
  const parts: Part[] = [];
  let last = 0;
  for (const m of content.matchAll(LIFT_RE)) {
    const before = content.slice(last, m.index).trim();
    if (before) parts.push({ kind: "text", text: before });
    const fields = m[1].split("|").map((f) => f.trim());
    // Malformed tokens (too few fields) are dropped rather than shown raw.
    if (fields.length >= 5) {
      // Models sometimes write "57.5 kg" despite the spec — keep numbers only.
      const num = (s: string) => s.replace(/[^\d.,]/g, "") || s;
      parts.push({
        kind: "lift",
        card: {
          name: fields[0],
          from: num(fields[1]),
          to: num(fields[2]),
          status: fields[3].toUpperCase(),
          history: fields.slice(4).join("|"),
        },
      });
    }
    last = (m.index ?? 0) + m[0].length;
  }
  const tail = content.slice(last).trim();
  if (tail) parts.push({ kind: "text", text: tail });
  return parts;
}

/** Render **bold** spans as accent + 600 — "key values highlighted in accent". */
function Emphasized({ text }: { text: string }) {
  const parts = text.split("**");
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="font-semibold text-primary">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

function LiftCardView({ card }: { card: LiftCard }) {
  const t = useT();
  const sessions = card.history.split("→").length;
  const ready = card.status === "READY";
  const statusLabel = ready
    ? t.coach.liftReady
    : card.status === "PLATEAU"
      ? t.coach.liftPlateau
      : t.coach.liftHold;

  return (
    <div className="flex justify-start">
      <div className="w-[88%] rounded-[14px] border border-primary/30 bg-card px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            {card.name} · {t.coach.lastN} {sessions}
          </span>
          <span
            className={`shrink-0 font-display text-[14px] font-semibold tracking-[0.08em] uppercase ${
              ready ? "text-success" : "text-muted-foreground"
            }`}
          >
            {statusLabel}
          </span>
        </div>
        <div className="mt-2.5 font-display text-[30px] font-bold leading-none">
          {card.from} <span className="text-[15px] text-muted-foreground">→</span>{" "}
          <span className="text-primary">
            {card.to} {t.session.kg.toUpperCase()}
          </span>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{card.history}</p>
      </div>
    </div>
  );
}

// --- Chat -------------------------------------------------------------------

export function CoachChat({ initialInput = "" }: { initialInput?: string }) {
  const t = useT();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState(initialInput);
  const [streaming, setStreaming] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function appendToLast(chunk: string) {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const copy = prev.slice();
      const last = copy[copy.length - 1];
      copy[copy.length - 1] = { ...last, content: last.content + chunk };
      return copy;
    });
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || streaming || disabled) return;

    const history: Msg[] = [...messages, { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (res.status === 503) {
        setDisabled(true);
        setMessages(messages); // roll back the optimistic user + placeholder
        return;
      }
      if (!res.ok || !res.body) {
        appendToLast(t.common.retry);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        appendToLast(decoder.decode(value, { stream: true }));
      }
    } catch {
      appendToLast(t.common.connectionLost);
    } finally {
      setStreaming(false);
    }
  }

  if (disabled) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center px-[22px] pb-32">
        <div className="flex flex-col items-center gap-3 rounded-[16px] bg-card p-6 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-foreground/[0.07] text-muted-foreground">
            <KeyRound className="size-5" />
          </div>
          <div>
            <h2 className="font-medium">{t.coach.offTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.coach.offBody}</p>
          </div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 rounded-[11px] bg-primary px-3.5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            <Settings className="size-4" />
            {t.coach.openSettings}
          </Link>
        </div>
      </div>
    );
  }

  const empty = messages.length === 0;
  const chips = [t.coach.analyze, ...t.coach.suggestions];
  const chipPrompt = (chip: string) =>
    chip === t.coach.analyze ? t.coach.analyzePrompt : chip;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Messages */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[22px] pt-5">
        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <Sparkles className="size-6 text-primary" fill="currentColor" />
            <div>
              <h2 className="font-display text-[22px] font-bold tracking-[0.04em] uppercase">
                {t.coach.emptyTitle}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t.coach.emptyBody}
              </p>
            </div>
          </div>
        ) : (
          messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-[16px] rounded-br-[4px] bg-primary px-3.5 py-2.5 text-sm font-medium leading-[1.45] text-primary-foreground">
                  {m.content}
                </div>
              </div>
            ) : (
              <CoachMessage
                key={i}
                content={m.content}
                streamingLabel={
                  streaming && i === messages.length - 1 ? t.coach.coaching : null
                }
              />
            )
          )
        )}
        <div ref={endRef} />
      </div>

      {/* Suggestion chips */}
      {!streaming && (
        <div className="flex shrink-0 gap-2 overflow-x-auto px-[22px] pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => send(chipPrompt(chip))}
              className="shrink-0 rounded-full border border-input px-3.5 py-2 text-[12px] text-foreground/75"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex shrink-0 items-center gap-2.5 px-[22px] pt-3 pb-[calc(env(safe-area-inset-bottom)+78px)]"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t.coach.placeholder}
          className="h-12 min-w-0 flex-1 rounded-[13px] bg-card px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
        />
        <button
          type="submit"
          aria-label={t.coach.send}
          disabled={streaming || !input.trim()}
          className="flex size-12 shrink-0 items-center justify-center rounded-[13px] bg-primary text-primary-foreground transition-transform active:scale-[0.96] disabled:opacity-50"
        >
          <Send className="size-[18px]" strokeWidth={2.4} />
        </button>
      </form>
    </div>
  );
}

/** One assistant reply: text bubbles interleaved with structured lift cards. */
function CoachMessage({
  content,
  streamingLabel,
}: {
  content: string;
  streamingLabel: string | null;
}) {
  const parts = parseCoachContent(content);

  if (parts.length === 0) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] rounded-[16px] rounded-bl-[4px] bg-card px-3.5 py-3 text-sm leading-[1.5] text-foreground/90">
          <span className="text-muted-foreground">{streamingLabel ?? "…"}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {parts.map((part, i) =>
        part.kind === "text" ? (
          <div key={i} className="flex justify-start">
            <div className="max-w-[90%] rounded-[16px] rounded-bl-[4px] bg-card px-3.5 py-3 text-sm leading-[1.5] whitespace-pre-wrap break-words text-foreground/90">
              <Emphasized text={part.text} />
            </div>
          </div>
        ) : (
          <LiftCardView key={i} card={part.card} />
        )
      )}
    </>
  );
}
