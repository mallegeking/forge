"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Plus, SkipForward, Timer } from "lucide-react";

type RestTimerContextValue = {
  /** Start (or restart) the rest countdown for `seconds`. */
  startRest: (seconds: number) => void;
};

const RestTimerContext = createContext<RestTimerContextValue | null>(null);

export function useRestTimer(): RestTimerContextValue {
  const ctx = useContext(RestTimerContext);
  if (!ctx) throw new Error("useRestTimer must be used within RestTimerProvider");
  return ctx;
}

function format(remaining: number): string {
  const s = Math.max(0, Math.ceil(remaining));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function RestTimerProvider({ children }: { children: React.ReactNode }) {
  // The timer is driven off an absolute end timestamp, so it stays correct even
  // if the tab is backgrounded and its timers are throttled.
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [flash, setFlash] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);

  const ensureAudio = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!audioRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Ctor) audioRef.current = new Ctor();
    }
    audioRef.current?.resume().catch(() => {});
    return audioRef.current;
  }, []);

  const beep = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    [0, 0.18].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.15);
      osc.start(now + offset);
      osc.stop(now + offset + 0.16);
    });
  }, []);

  const startRest = useCallback(
    (seconds: number) => {
      ensureAudio(); // resume audio within the click gesture so the beep can play
      setTotal(seconds);
      setRemaining(seconds);
      setFlash(false);
      setEndsAt(Date.now() + seconds * 1000);
    },
    [ensureAudio]
  );

  const addTime = useCallback((seconds: number) => {
    setTotal((t) => t + seconds);
    setEndsAt((e) => (e ?? Date.now()) + seconds * 1000);
  }, []);

  const skip = useCallback(() => {
    setEndsAt(null);
    setFlash(false);
  }, []);

  // Tick + completion.
  useEffect(() => {
    if (endsAt == null) return;
    let raf = 0;
    const tick = () => {
      const rem = (endsAt - Date.now()) / 1000;
      if (rem <= 0) {
        setRemaining(0);
        setEndsAt(null);
        setFlash(true);
        beep();
        navigator.vibrate?.([200, 90, 200]);
        window.setTimeout(() => setFlash(false), 2500);
        return;
      }
      setRemaining(rem);
      raf = window.setTimeout(tick, 200);
    };
    raf = window.setTimeout(tick, 0);
    return () => window.clearTimeout(raf);
  }, [endsAt, beep]);

  const visible = endsAt != null || flash;
  const progress = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;

  return (
    <RestTimerContext.Provider value={{ startRest }}>
      {children}
      {visible && (
        <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-lg ring-1 ring-foreground/10 backdrop-blur">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Timer className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              {flash ? (
                <p className="text-sm font-medium text-success">Rest complete 💪</p>
              ) : (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground">Rest</span>
                    <span className="font-mono text-lg font-semibold tabular-nums">
                      {format(remaining)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-200 ease-linear"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                </>
              )}
            </div>
            {!flash && (
              <div className="flex shrink-0 gap-1.5">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => addTime(30)}
                  className="h-10 gap-1 px-3"
                >
                  <Plus className="size-4" />
                  30s
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={skip}
                  className="h-10 gap-1 px-3"
                >
                  <SkipForward className="size-4" />
                  Skip
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </RestTimerContext.Provider>
  );
}
