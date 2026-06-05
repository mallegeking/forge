"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, KeyRound, Settings } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

// The one-tap analysis prompt and a few starter questions.
const ANALYZE_PROMPT =
  "Analyze my recent training and tell me what to prioritize — what to add weight to, what's plateaued and how to break it, and anything to watch.";
const SUGGESTIONS = [
  "What should I focus on this week?",
  "Any lifts ready for more weight?",
  "I've plateaued — what do I change?",
];

export function CoachChat({ initialInput = "" }: { initialInput?: string }) {
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
        appendToLast("⚠️ Something went wrong. Please try again.");
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
      appendToLast("⚠️ Connection lost. Please try again.");
    } finally {
      setStreaming(false);
    }
  }

  if (disabled) {
    return (
      <Card className="flex flex-col items-center gap-3 p-6 text-center">
        <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <KeyRound className="size-5" />
        </div>
        <div>
          <h2 className="font-medium">Coach is off</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect an AI provider to start chatting with your coach.
          </p>
        </div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          <Settings className="size-4" />
          Open settings
        </Link>
      </Card>
    );
  }

  const empty = messages.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {empty ? (
        <Card className="flex flex-col items-center gap-4 p-6 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h2 className="font-medium">Your training coach</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Advice grounded in what you&apos;ve actually logged.
            </p>
          </div>
          <Button className="h-11 w-full gap-1.5" onClick={() => send(ANALYZE_PROMPT)}>
            <Sparkles className="size-4" />
            Analyze my training
          </Button>
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <Button
                key={s}
                variant="outline"
                size="sm"
                onClick={() => send(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user" ? "flex justify-end" : "flex justify-start"
              }
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground"
                    : "max-w-[90%] rounded-2xl rounded-bl-sm bg-card px-3.5 py-2 text-sm whitespace-pre-wrap break-words ring-1 ring-foreground/10"
                }
              >
                {m.content ||
                  (streaming && m.role === "assistant" ? (
                    <span className="text-muted-foreground">Coaching…</span>
                  ) : null)}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2"
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask your coach…"
          rows={1}
          className="max-h-32 min-h-11 flex-1 resize-none"
        />
        <Button
          type="submit"
          size="icon-lg"
          aria-label="Send"
          disabled={streaming || !input.trim()}
        >
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
