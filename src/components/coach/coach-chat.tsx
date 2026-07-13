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

/** A failed request, classified by the route (see coach-response.ts). */
type CoachFailure = {
  reason: string;
  /** When a rate limit told us to wait: earliest sensible retry time (ms). */
  retryAt: number | null;
};

export function CoachChat({ initialInput = "" }: { initialInput?: string }) {
  const t = useT();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState(initialInput);
  const [streaming, setStreaming] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [failure, setFailure] = useState<CoachFailure | null>(null);
  // Ticks while a retry countdown is showing, forcing re-renders.
  const [, setCountdownTick] = useState(0);
  const lastHistory = useRef<Msg[] | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, failure]);

  useEffect(() => {
    if (!failure?.retryAt) return;
    const id = setInterval(() => {
      setCountdownTick((n) => n + 1);
      if (Date.now() >= failure.retryAt!) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [failure]);

  function appendToLast(chunk: string) {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const copy = prev.slice();
      const last = copy[copy.length - 1];
      copy[copy.length - 1] = { ...last, content: last.content + chunk };
      return copy;
    });
  }

  async function run(history: Msg[]) {
    lastHistory.current = history;
    setFailure(null);
    setMessages([...history, { role: "assistant", content: "" }]);
    setStreaming(true);
    // Whether any model text arrived — decides between "roll back and show a
    // retryable error card" and "keep the partial reply, note the break".
    let received = false;

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (res.status === 503) {
        setDisabled(true);
        setMessages(history.slice(0, -1)); // roll back the optimistic turn
        return;
      }
      if (!res.ok || !res.body) {
        // Classified provider failure — drop the empty placeholder (the user
        // message stays) and show the reason with a retry.
        setMessages(history);
        let reason = "other";
        let retryAfterSeconds: number | null = null;
        try {
          const body = (await res.json()) as {
            error?: string;
            retryAfterSeconds?: number | null;
          };
          if (body.error) reason = body.error;
          retryAfterSeconds = body.retryAfterSeconds ?? null;
        } catch {
          // non-JSON body — keep the generic reason
        }
        setFailure({
          reason,
          retryAt: retryAfterSeconds
            ? Date.now() + retryAfterSeconds * 1000
            : null,
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) received = true;
        appendToLast(chunk);
      }
    } catch {
      if (received) {
        // Mid-stream network break — keep the partial reply, note the cut.
        appendToLast(t.common.connectionLost);
      } else {
        setMessages(history);
        setFailure({ reason: "network", retryAt: null });
      }
    } finally {
      setStreaming(false);
    }
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || streaming || disabled) return;
    setInput("");
    await run([...messages, { role: "user", content }]);
  }

  function retry() {
    if (!streaming && lastHistory.current) void run(lastHistory.current);
  }

  const failureText = (reason: string) =>
    reason === "rate_limited"
      ? t.common.aiRateLimited
      : reason === "overloaded"
        ? t.common.aiOverloaded
        : reason === "auth"
          ? t.common.aiAuthError
          : t.common.aiUnreachable;

  const retryWaitSeconds = failure?.retryAt
    ? Math.max(0, Math.ceil((failure.retryAt - Date.now()) / 1000))
    : 0;

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
        {failure && !streaming && (
          <div className="flex justify-start">
            <div className="flex max-w-[90%] flex-col items-start gap-2.5 rounded-[16px] rounded-bl-[4px] bg-card px-3.5 py-3">
              <p className="text-sm leading-[1.5] text-foreground/90">
                ⚠️ {failureText(failure.reason)}
              </p>
              <button
                type="button"
                onClick={retry}
                disabled={retryWaitSeconds > 0}
                className="rounded-[10px] bg-primary px-3.5 py-2 text-[12px] font-semibold text-primary-foreground transition-transform active:scale-[0.97] disabled:opacity-50"
              >
                {retryWaitSeconds > 0
                  ? `${t.common.retryAction} (${retryWaitSeconds}s)`
                  : t.common.retryAction}
              </button>
            </div>
          </div>
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
