"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Check,
  SkipForward,
  Flame,
  Trash2,
  Pencil,
  Sparkles,
} from "lucide-react";
import {
  deloadAdjust,
  readinessToIncrease,
  summarizeExerciseSession,
  suggestIncrement,
  type RepRange,
} from "@/lib/progression";
import { TIP_STREAM_ERROR_SENTINEL } from "@/lib/coach";
import {
  formatWeight,
  formatSet,
  formatRelativeDay,
  shortDayName,
} from "@/lib/format";
import {
  logSetAction,
  updateSetAction,
  deleteSetAction,
  completeSessionAction,
  reopenSessionAction,
  saveNoteAction,
} from "@/app/actions";
import { useT, useLocale } from "@/components/i18n/i18n-provider";
import type {
  SessionView as SessionViewData,
  SessionExerciseView,
  LoggedSetRow,
} from "@/lib/queries";

const EASE = "cubic-bezier(0.22,1,0.36,1)";

/** ISO weekday (1 = Mon … 7 = Sun). Local copy so this client file doesn't
    pull the server `queries` module (and its DB imports) into the bundle. */
function isoWeekday(date: Date): number {
  return ((date.getDay() + 6) % 7) + 1;
}

type Highlight = {
  name: string;
  tag: string;
  kind: "PR" | "READY" | "HELD";
};

type Receipt = {
  volumeT: string;
  totalSets: number;
  /** null when the wall-clock span is meaningless (resumed much later). */
  durationMin: number | null;
  highlights: Highlight[];
};

export function SessionView({
  view,
  weekTotal,
  weekDoneAfter,
  exerciseCount,
  nextDay,
}: {
  view: SessionViewData;
  weekTotal: number;
  /** Completed-this-week count as it will read once this session finishes. */
  weekDoneAfter: number;
  exerciseCount: number;
  nextDay: { name: string; weekday: number } | null;
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();
  useWakeLock();

  const exercises = view.exercises;
  const isDeload = view.session.isDeload;
  const startAt = view.session.performedAt.getTime();
  const weekday = isoWeekday(view.session.performedAt);

  const rxOf = useCallback(
    (ex: SessionExerciseView): RepRange => ({
      targetSets: ex.targetSets,
      repMin: ex.repMin,
      repMax: ex.repMax,
    }),
    []
  );
  const effSetsOf = useCallback(
    (ex: SessionExerciseView) =>
      isDeload ? deloadAdjust(rxOf(ex)).targetSets : ex.targetSets,
    [isDeload, rxOf]
  );

  // Per-exercise logged sets, seeded from what's already persisted (a resumed
  // session keeps its history). The DB stays the source of truth — each logged
  // set is written through `logSetAction`.
  const [logged, setLogged] = useState<LoggedSetRow[][]>(() =>
    exercises.map((ex) => ex.loggedSets)
  );

  // Start on the first exercise that still has sets to log.
  const initialIndex = useMemo(() => {
    const i = exercises.findIndex(
      (ex, idx) => exercises[idx].loggedSets.length < effSetsOf(ex)
    );
    return i === -1 ? 0 : i;
  }, [exercises, effSetsOf]);

  const [exIndex, setExIndex] = useState(initialIndex);
  const [screen, setScreen] = useState<"session" | "done">("session");
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const ex = exercises[exIndex];
  const cur = logged[exIndex] ?? [];
  const effSets = effSetsOf(ex);
  const targetMet = cur.length >= effSets;
  const isLast = exIndex >= exercises.length - 1;
  // Bodyweight-plus lifts show their load as ADDED weight: "+7.5 KG × 7".
  const pre = ex.isBodyweightPlus ? "+" : "";

  // Seed the steppers for an exercise: the last set you logged for it, else the
  // first set of last time (lightened on a deload), else the top of the range.
  const seedFor = useCallback(
    (i: number, currentLogged: LoggedSetRow[][]) => {
      const e = exercises[i];
      const own = currentLogged[i];
      if (own && own.length > 0) {
        const last = own[own.length - 1];
        return { weight: last.weightKg, reps: last.reps };
      }
      const fromHistory = e.lastSession?.sets[0]?.weightKg ?? 0;
      const weight =
        isDeload && fromHistory > 0
          ? Math.round((fromHistory * deloadAdjust(rxOf(e)).loadFactor) / 2.5) * 2.5
          : fromHistory;
      return { weight, reps: e.repMax };
    },
    [exercises, isDeload, rxOf]
  );

  const [weight, setWeight] = useState(() => seedFor(initialIndex, exercises.map((e) => e.loggedSets)).weight);
  const [reps, setReps] = useState(() => seedFor(initialIndex, exercises.map((e) => e.loggedSets)).reps);
  // Per-tap weight increment — cycles through machine-friendly steps so fixed
  // machines (e.g. a 2 kg or 5 kg pin) can be dialled in as fast as plates.
  const [weightStep, setWeightStep] = useState(2.5);

  // --- Clock + rest timer (driven off absolute timestamps) ------------------
  const [now, setNow] = useState(() => Date.now());
  // A session resumed hours/days after it was started would show an absurd
  // elapsed clock ("1002:50"). Past the same 4h cap the durations use, the
  // clock (and the receipt's duration) counts from when this screen opened.
  const [mountedAt] = useState(() => Date.now());
  const clockBase =
    mountedAt - startAt > 4 * 60 * 60 * 1000 ? mountedAt : startAt;
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(0);
  const [flashUntil, setFlashUntil] = useState(0);
  // When set, the rest sheet is a between-exercise transition (not inter-set
  // rest); holds the next exercise's name for the sheet copy.
  const [transition, setTransition] = useState<string | null>(null);

  // Mirror restEnd into a ref so the single interval can read the latest value
  // without re-subscribing every tick.
  const restEndRef = useRef<number | null>(null);
  useEffect(() => {
    restEndRef.current = restEnd;
  }, [restEnd]);

  const audioRef = useRef<AudioContext | null>(null);
  const ensureAudio = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!audioRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Ctor) audioRef.current = new Ctor();
    }
    audioRef.current?.resume().catch(() => {});
  }, []);

  const beep = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx) return;
    const at = ctx.currentTime;
    [0, 0.18].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, at + offset);
      gain.gain.exponentialRampToValueAtTime(0.2, at + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + offset + 0.15);
      osc.start(at + offset);
      osc.stop(at + offset + 0.16);
    });
  }, []);

  // One 250ms tick drives the elapsed clock and the rest countdown. When the
  // rest timer expires naturally it fires a double beep + the (non-blocking)
  // rest-over flash. setState lives in the interval callback (not the effect
  // body), so it doesn't cascade renders.
  useEffect(() => {
    if (screen !== "session") return;
    const id = window.setInterval(() => {
      const end = restEndRef.current;
      if (end != null && Date.now() >= end) {
        setRestEnd(null);
        setTransition(null);
        setFlashUntil(Date.now() + 2400);
        setNow(Date.now());
        beep();
        navigator.vibrate?.([200, 90, 200]);
      } else {
        setNow(Date.now());
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [screen, beep]);

  // --- Notes (optional, per exercise) ---------------------------------------
  const [noteOpen, setNoteOpen] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(exercises.map((e) => [e.exerciseId, e.note ?? ""]))
  );

  // Which logged set (if any) is currently open in the inline editor.
  const [editingSetId, setEditingSetId] = useState<string | null>(null);

  // Proactive AI coach tip per exercise, keyed by exerciseId. Tips are
  // pre-generated at session start and stored server-side (session_tips), so
  // most arrive with the page; the endpoint fills gaps on demand and persists
  // them, which is why reloads never re-bill the model. `tipState` tracks
  // loading vs off (no provider) vs error (transient failure — retryable,
  // never cached) so the card can fall back to its rule-based line.
  const [tips, setTips] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      exercises.filter((e) => e.tip).map((e) => [e.exerciseId, e.tip!])
    )
  );
  const [tipState, setTipState] = useState<
    Record<string, "loading" | "done" | "off" | "error">
  >(() =>
    Object.fromEntries(
      exercises.filter((e) => e.tip).map((e) => [e.exerciseId, "done" as const])
    )
  );
  // Bumping this refetches the current exercise's tip (the "Retry" button).
  const [tipNonce, setTipNonce] = useState(0);
  const tipLoaded = useRef<Set<string>>(
    new Set(exercises.filter((e) => e.tip).map((e) => e.exerciseId))
  );
  const tipInFlight = useRef<Set<string>>(new Set());
  // Set to an exerciseId by "Retry": the next fetch asks the server to
  // regenerate instead of returning the stored tip.
  const freshTipFor = useRef<string | null>(null);

  // --- Mutations ------------------------------------------------------------
  const moveTo = useCallback(
    (i: number) => {
      setExIndex(i);
      setRestEnd(null);
      setTransition(null);
      setFlashUntil(0);
      setNoteOpen(false);
      setEditingSetId(null);
      setLogged((prev) => {
        const sd = seedFor(i, prev);
        setWeight(sd.weight);
        setReps(sd.reps);
        return prev;
      });
    },
    [seedFor]
  );

  const logSet = useCallback(() => {
    ensureAudio();
    const tempId = `temp-${Date.now()}`;
    const optimistic: LoggedSetRow = {
      id: tempId,
      setNumber: cur.length + 1,
      weightKg: weight,
      reps,
    };
    const complete = cur.length + 1 >= effSets;
    setLogged((prev) =>
      prev.map((rows, i) => (i === exIndex ? [...rows, optimistic] : rows))
    );
    setFlashUntil(0);
    if (!complete) {
      setRestTotal(ex.defaultRestSeconds);
      setRestEnd(Date.now() + ex.defaultRestSeconds * 1000);
    }
    startTransition(async () => {
      const saved = await logSetAction({
        sessionId: view.session.id,
        exerciseId: ex.exerciseId,
        weightKg: weight,
        reps,
      });
      setLogged((prev) =>
        prev.map((rows, i) =>
          i === exIndex
            ? rows.map((s) =>
                s.id === tempId
                  ? { ...s, id: saved.id, setNumber: saved.setNumber }
                  : s
              )
            : rows
        )
      );
    });
  }, [cur.length, weight, reps, effSets, ex, exIndex, view.session.id, ensureAudio, startTransition]);

  // Edit a logged set in place (optimistic, then persisted).
  const commitSetEdit = useCallback(
    (setId: string, weightKg: number, reps: number) => {
      setEditingSetId(null);
      setLogged((prev) =>
        prev.map((rows, i) =>
          i === exIndex
            ? rows.map((s) => (s.id === setId ? { ...s, weightKg, reps } : s))
            : rows
        )
      );
      startTransition(async () => {
        await updateSetAction({
          id: setId,
          sessionId: view.session.id,
          weightKg,
          reps,
        });
      });
    },
    [exIndex, view.session.id, startTransition]
  );

  // Delete a logged set (optimistic). The server reindexes the remaining sets.
  const removeSet = useCallback(
    (setId: string) => {
      setEditingSetId(null);
      setLogged((prev) =>
        prev.map((rows, i) =>
          i === exIndex ? rows.filter((s) => s.id !== setId) : rows
        )
      );
      startTransition(async () => {
        await deleteSetAction({ id: setId, sessionId: view.session.id });
      });
    },
    [exIndex, view.session.id, startTransition]
  );

  // Advance to the next exercise and start a skippable transition rest using
  // that exercise's rest time. Only the primary "Next" button calls this —
  // jumping via the progress bars stays instant.
  const goNextExercise = useCallback(() => {
    const next = exercises[exIndex + 1];
    moveTo(exIndex + 1);
    if (next) {
      ensureAudio();
      setRestTotal(next.defaultRestSeconds);
      setRestEnd(Date.now() + next.defaultRestSeconds * 1000);
      setTransition(next.name);
    }
  }, [exercises, exIndex, moveTo, ensureAudio]);

  const finish = useCallback(() => {
    // Guard against an accidental finish: if any exercise still has sets to log,
    // confirm before sealing the session.
    const incomplete = exercises.filter(
      (e, i) => (logged[i] ?? []).length < effSetsOf(e)
    ).length;
    if (incomplete > 0 && !window.confirm(t.session.finishConfirm)) return;

    let volKg = 0;
    let totalSets = 0;
    const highlights: Highlight[] = [];

    exercises.forEach((e, i) => {
      const sets = logged[i] ?? [];
      totalSets += sets.length;
      sets.forEach((s) => (volKg += s.weightKg * s.reps));
      if (sets.length === 0) return;

      const exPre = e.isBodyweightPlus ? "+" : "";
      const bestW = Math.max(...sets.map((s) => s.weightKg));
      const prevBest = e.lastSession
        ? Math.max(...e.lastSession.sets.map((s) => s.weightKg))
        : 0;
      // Consolidation-aware: READY only when today topped the range at a
      // weight already confirmed last session (a fresh weight shows PR/HELD).
      const summaries = [
        summarizeExerciseSession(
          sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps })),
          rxOf(e)
        ),
        ...(e.lastSession
          ? [summarizeExerciseSession(e.lastSession.sets, rxOf(e))]
          : []),
      ];
      const ready = readinessToIncrease(summaries) === "ready";

      if (e.lastSession && bestW > prevBest) {
        const bestSet = sets
          .filter((s) => s.weightKg === bestW)
          .sort((a, b) => b.reps - a.reps)[0];
        highlights.push({
          name: e.name,
          kind: "PR",
          tag: `${t.receipt.pr} · ${exPre}${formatWeight(bestW)} ${t.receipt.kg} × ${bestSet.reps}`,
        });
      } else if (ready) {
        const inc = suggestIncrement(e.type);
        highlights.push({
          name: e.name,
          kind: "READY",
          tag: `${t.receipt.ready} · +${formatWeight(inc.min)} ${t.receipt.kgNext}`,
        });
      } else {
        highlights.push({
          name: e.name,
          kind: "HELD",
          tag: `${t.receipt.held} · ${exPre}${formatWeight(bestW)} ${t.receipt.kg}`,
        });
      }
    });

    const order = { PR: 0, READY: 1, HELD: 2 } as const;
    highlights.sort((a, b) => order[a.kind] - order[b.kind]);

    const rawMin = Math.max(1, Math.round((Date.now() - clockBase) / 60000));

    setReceipt({
      volumeT: (volKg / 1000).toFixed(1),
      totalSets,
      durationMin: rawMin <= 240 ? rawMin : null,
      highlights: highlights.slice(0, 3),
    });
    setRestEnd(null);
    setScreen("done");
    startTransition(async () => {
      await completeSessionAction({ sessionId: view.session.id });
    });
  }, [exercises, logged, effSetsOf, rxOf, clockBase, t, view.session.id, startTransition]);

  // Reopen a finished session from the receipt and drop back into logging.
  const continueWorkout = useCallback(() => {
    setReceipt(null);
    setScreen("session");
    startTransition(async () => {
      await reopenSessionAction({ sessionId: view.session.id });
    });
  }, [view.session.id, startTransition]);

  const saveNote = useCallback(() => {
    const value = notes[ex.exerciseId] ?? "";
    if (value === (ex.note ?? "")) return;
    startTransition(async () => {
      await saveNoteAction({
        sessionId: view.session.id,
        exerciseId: ex.exerciseId,
        note: value,
      });
    });
  }, [notes, ex, view.session.id, startTransition]);

  // Fetch the per-exercise coach tip when the current exercise changes. Tips
  // pre-generated at session start arrive with the page (state is seeded
  // above); this only fires for gaps, and the server stores what it generates,
  // so navigating back or reloading is free.
  const exerciseId = ex.exerciseId;
  useEffect(() => {
    if (tipLoaded.current.has(exerciseId)) return;
    if (tipInFlight.current.has(exerciseId)) return;
    tipInFlight.current.add(exerciseId);
    const fresh = freshTipFor.current === exerciseId;
    freshTipFor.current = null;

    let aborted = false;
    const controller = new AbortController();
    setTipState((p) => ({ ...p, [exerciseId]: "loading" }));
    (async () => {
      try {
        const res = await fetch("/api/coach/tip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: view.session.id, exerciseId, fresh }),
          signal: controller.signal,
        });
        // 503 = no provider configured — permanently off, rule-based line only.
        // Any other non-OK is transient (server hiccup) — offer a retry.
        if (!res.ok || !res.body) {
          if (!aborted) {
            const off = res.status === 503;
            setTipState((p) => ({ ...p, [exerciseId]: off ? "off" : "error" }));
            if (off) tipLoaded.current.add(exerciseId);
          }
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          if (!aborted && !acc.includes(TIP_STREAM_ERROR_SENTINEL)) {
            setTips((p) => ({ ...p, [exerciseId]: acc }));
          }
        }
        acc += decoder.decode();
        if (!aborted) {
          // The route signals mid-stream provider failures with an in-band
          // sentinel (headers were already 200). Discard the partial tip and
          // surface a retry — caching it would pin the failure for the whole
          // session (the old bug: an error note stuck until the tab died).
          if (acc.includes(TIP_STREAM_ERROR_SENTINEL)) {
            setTips((p) => ({ ...p, [exerciseId]: "" }));
            setTipState((p) => ({ ...p, [exerciseId]: "error" }));
            return;
          }
          const text = acc.trim();
          setTips((p) => ({ ...p, [exerciseId]: text }));
          setTipState((p) => ({ ...p, [exerciseId]: text ? "done" : "off" }));
          tipLoaded.current.add(exerciseId);
        }
      } catch {
        // Aborted (exercise changed) or network error — show a retry so the
        // athlete can refetch without leaving the exercise.
        if (!aborted) setTipState((p) => ({ ...p, [exerciseId]: "error" }));
      } finally {
        tipInFlight.current.delete(exerciseId);
      }
    })();

    return () => {
      aborted = true;
      controller.abort();
    };
  }, [exerciseId, view.session.id, tipNonce]);

  // Retry a failed tip fetch: clear the cached state for this exercise and
  // re-run the effect above, asking the server to regenerate (skip its store).
  const retryTip = useCallback(() => {
    freshTipFor.current = exerciseId;
    tipLoaded.current.delete(exerciseId);
    setTips((p) => ({ ...p, [exerciseId]: "" }));
    setTipState((p) => ({ ...p, [exerciseId]: "loading" }));
    setTipNonce((n) => n + 1);
  }, [exerciseId]);

  // --- Receipt screen -------------------------------------------------------
  if (screen === "done" && receipt) {
    return (
      <ReceiptScreen
        dayName={view.dayName}
        weekNumber={view.session.weekNumber}
        weekday={weekday}
        receipt={receipt}
        exerciseCount={exerciseCount}
        weekDone={Math.min(weekDoneAfter, weekTotal)}
        weekTotal={weekTotal}
        nextDay={nextDay}
        onDone={() => router.push("/")}
        onContinue={continueWorkout}
      />
    );
  }

  // --- Derived view state ---------------------------------------------------
  const segs = exercises.map((e, i) => {
    const done = (logged[i] ?? []).length >= effSetsOf(e);
    if (done) return "bg-success";
    if (i === exIndex) return "bg-primary";
    return "bg-[var(--fill-track)]";
  });

  const restRemaining = restEnd ? Math.max(0, (restEnd - now) / 1000) : 0;
  const restPct = restTotal > 0 ? (restRemaining / restTotal) * 100 : 0;
  const restVisible = restEnd != null;
  const flashVisible = restEnd == null && flashUntil > now;
  const lastSet = cur[cur.length - 1];

  // Rule-based "coach's read" anchor — instant, and the fallback when the AI
  // tip is off. (Plateau needs multi-session history, which the AI tip covers.)
  const anchor = (() => {
    const last = ex.lastSession;
    if (!last || last.sets.length === 0) {
      return { kind: "first" as const, target: null as number | null, inc: 0 };
    }
    const lastSets = last.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps }));
    const top = Math.max(...lastSets.map((s) => s.weightKg));
    if (isDeload) {
      // Deload target ≈ 60% of the last normal top set, rounded like the
      // stepper seed — the card must not prescribe full working weight on a
      // recovery day.
      const factor = deloadAdjust(rxOf(ex)).loadFactor;
      const target = Math.max(0, Math.round((top * factor) / 2.5) * 2.5);
      return { kind: "hold" as const, target, inc: 0 };
    }
    // Consolidation-aware readiness, computed server-side over the prior two
    // sessions: a first session at a new weight that topped the range reads
    // "confirm this weight" instead of immediately prescribing more.
    if (ex.readiness === "ready") {
      const inc = suggestIncrement(ex.type);
      return { kind: "ready" as const, target: top + inc.min, inc: inc.min };
    }
    if (ex.readiness === "consolidate") {
      return { kind: "consolidate" as const, target: top, inc: 0 };
    }
    return { kind: "hold" as const, target: top, inc: 0 };
  })();
  const tip = tips[ex.exerciseId];
  const tipLoading = tipState[ex.exerciseId] === "loading" && !tip;
  const tipError = tipState[ex.exerciseId] === "error";

  const primaryLabel = !targetMet
    ? `${t.session.logSet} ${cur.length + 1}`
    : !isLast
      ? `${t.session.next} · ${exercises[exIndex + 1].name}`
      : t.session.finish;
  const primaryAction = !targetMet ? logSet : !isLast ? goNextExercise : finish;

  const nextHint = isLast
    ? targetMet
      ? ""
      : t.session.skipToFinish
    : t.session.skipExercise;

  return (
    <div
      className="-mx-4 -mt-5 -mb-28 flex min-h-dvh flex-col"
      style={{ animation: `slideInRight 0.35s ${EASE} both`, "--fill-track": "rgba(244,239,232,0.12)" } as React.CSSProperties}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-[22px] pt-[max(env(safe-area-inset-top),12px)]">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              // Logged sets are already persisted; the confirm only guards
              // against accidentally leaving mid-workout.
              const started = logged.some((rows) => rows.length > 0);
              if (started && !window.confirm(t.session.leaveConfirm)) return;
              router.push("/");
            }}
            aria-label={t.common.back}
            className="-m-1.5 p-1.5 text-muted-foreground"
          >
            <ChevronLeft className="size-[18px]" strokeWidth={2.2} />
          </button>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-display text-[17px] font-bold leading-none tracking-[0.14em] uppercase">
              {shortDayName(view.dayName)}
            </span>
            <span className="mt-1 text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              {t.session.week} {view.session.weekNumber} ·{" "}
              {t.weekdaysShort[weekday]}
            </span>
          </div>
        </div>
        <span className="font-display text-[17px] font-semibold tracking-[0.08em] text-muted-foreground tabular-nums">
          {fmtClock((now - clockBase) / 1000)}
        </span>
      </header>

      {/* Progress segments — tap one to jump to that exercise (incl. skipped). */}
      <div
        className="mx-[22px] mt-4 grid gap-1"
        style={{ gridTemplateColumns: `repeat(${exercises.length}, 1fr)` }}
      >
        {segs.map((bg, i) => (
          <button
            key={i}
            type="button"
            onClick={() => moveTo(i)}
            aria-label={`${t.session.exercise} ${i + 1}`}
            aria-current={i === exIndex ? "step" : undefined}
            className="-my-2 flex items-center py-2"
          >
            <span
              className={`h-1 w-full rounded-[2px] transition-colors duration-300 ${bg}`}
            />
          </button>
        ))}
      </div>

      {/* Exercise header — re-animates each time the exercise changes */}
      <div
        key={exIndex}
        className="px-[22px] pt-[18px]"
        style={{ animation: `slideInRight 0.32s ${EASE} both` }}
      >
        <span className="font-semibold text-[11px] tracking-[0.22em] text-primary uppercase">
          {t.session.exercise} {exIndex + 1} {t.session.of} {exercises.length}
        </span>
        {/* The title opens the exercise's history/plateau page — logged sets
            are already persisted, so navigating away loses nothing. */}
        <Link
          href={`/exercises/${ex.exerciseId}`}
          className="group mt-1.5 flex items-baseline gap-2"
        >
          <h1 className="min-w-0 font-display text-[42px] font-bold leading-[0.95] tracking-[0.01em] uppercase group-active:text-foreground/80">
            {ex.name}
          </h1>
          <ChevronRight
            className="size-5 shrink-0 self-center text-muted-foreground"
            strokeWidth={2.4}
          />
        </Link>
        <p className="mt-2 text-[12px] tracking-[0.14em] text-muted-foreground uppercase">
          {effSets} {effSets === 1 ? t.session.set : t.session.sets} ·{" "}
          {ex.repMin}–{ex.repMax} {t.session.reps} · {t.exerciseTypes[ex.type]}
          {isDeload ? ` · ${t.session.deload}` : ""}
        </p>
        {ex.injuryNote && (
          <p className="mt-1.5 text-[12px] text-destructive">⚠ {ex.injuryNote}</p>
        )}
        <p className="mt-2 text-[12px] text-muted-foreground">
          {ex.lastSession ? (
            <>
              {t.session.lastTime}{" "}
              {formatRelativeDay(ex.lastSession.performedAt, t.common, locale)} ·{" "}
              <span className="text-secondary-foreground/80">
                {ex.lastSession.sets
                  .map((s) => `${pre}${formatSet(s.weightKg, s.reps)}`)
                  .join(" · ")}
              </span>
            </>
          ) : (
            t.session.firstTime
          )}
        </p>

        {/* Coach's read — instant rule-based verdict + streamed AI tip. */}
        <div className="mt-3 rounded-[12px] bg-card px-3.5 py-3">
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-primary" strokeWidth={2.2} />
            <span className="font-semibold text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              {t.session.coachRead}
            </span>
            <span
              className={`ml-auto font-display text-[12px] font-semibold tracking-[0.08em] uppercase ${
                anchor.kind === "ready"
                  ? "text-success"
                  : anchor.kind === "consolidate"
                    ? "text-primary"
                    : "text-muted-foreground"
              }`}
            >
              {anchor.kind === "ready"
                ? `${t.session.coachReady} · +${formatWeight(anchor.inc)} ${t.session.kg}`
                : anchor.kind === "consolidate"
                  ? t.session.coachConsolidate
                  : anchor.kind === "first"
                    ? t.session.coachFirstTime
                    : t.session.coachHold}
            </span>
          </div>
          {anchor.target != null && (
            <p className="mt-1 text-[12px] text-muted-foreground">
              {t.session.coachTarget}:{" "}
              <span className="text-secondary-foreground">
                {pre}
                {formatWeight(anchor.target)} {t.session.kg}
              </span>
            </p>
          )}
          {tip ? (
            <p className="mt-1.5 text-[13px] leading-snug text-secondary-foreground">
              {tip}
            </p>
          ) : tipLoading ? (
            <p className="mt-1.5 animate-pulse text-[12px] text-muted-foreground">
              {t.session.coachReading}
            </p>
          ) : tipError ? (
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <p className="text-[12px] text-muted-foreground">
                ⚠️ {t.session.coachTipError}
              </p>
              <button
                type="button"
                onClick={retryTip}
                className="shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-primary hover:bg-primary/10"
              >
                {t.common.retryAction}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Logged-set rows (+ optional note) */}
      <div className="mt-3.5 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-[22px] pb-2">
        {cur.map((s, i) =>
          editingSetId === s.id ? (
            <SetEditor
              key={s.id}
              index={i}
              set={s}
              pre={pre}
              t={t}
              onSave={(w, r) => commitSetEdit(s.id, w, r)}
              onCancel={() => setEditingSetId(null)}
            />
          ) : (
            <SwipeableSetRow
              key={s.id}
              index={i}
              set={s}
              pre={pre}
              t={t}
              canModify={!s.id.startsWith("temp-")}
              onEdit={() => setEditingSetId(s.id)}
              onDelete={() => removeSet(s.id)}
            />
          )
        )}
        {noteOpen && (
          <textarea
            autoFocus
            value={notes[ex.exerciseId] ?? ""}
            onChange={(e) =>
              setNotes((prev) => ({ ...prev, [ex.exerciseId]: e.target.value }))
            }
            onBlur={saveNote}
            placeholder={t.session.notePlaceholder}
            rows={2}
            className="resize-none rounded-[12px] bg-card px-3.5 py-2.5 text-[13px] text-foreground outline-none ring-1 ring-input placeholder:text-muted-foreground"
            style={{ animation: `riseIn 0.28s ${EASE} both` }}
          />
        )}
      </div>

      {/* Bottom control block */}
      <div className="px-[22px] pt-3 pb-[max(env(safe-area-inset-bottom),26px)]">
        <div className="grid grid-cols-2 gap-2.5">
          <Stepper
            label={t.session.weightKgLabel}
            value={`${pre}${formatWeight(weight)}`}
            onDec={() => setWeight((w) => Math.max(0, Math.round((w - weightStep) * 100) / 100))}
            onInc={() => setWeight((w) => Math.round((w + weightStep) * 100) / 100)}
            decLabel={`${t.session.decrease} ${t.session.kg}`}
            incLabel={`${t.session.increase} ${t.session.kg}`}
            editValue={weight}
            editLabel={t.session.editWeightLabel}
            onEditCommit={(n) => setWeight(Math.max(0, Math.round(n * 100) / 100))}
            footer={
              <StepSelect
                step={weightStep}
                onSelect={setWeightStep}
                label={t.session.step}
                unit={t.session.kg}
              />
            }
          />
          <Stepper
            label={t.session.repsLabel}
            value={String(reps)}
            onDec={() => setReps((r) => Math.max(0, r - 1))}
            onInc={() => setReps((r) => r + 1)}
            decLabel={`${t.session.decrease} ${t.session.reps}`}
            incLabel={`${t.session.increase} ${t.session.reps}`}
          />
        </div>

        <button
          type="button"
          onClick={primaryAction}
          className={`mt-3 flex h-[56px] w-full items-center justify-center rounded-[14px] text-primary-foreground transition-transform active:scale-[0.98] ${
            targetMet ? "bg-success" : "bg-primary"
          }`}
          style={{ transition: "background-color 0.25s ease, transform 0.1s ease" }}
        >
          <span className="truncate px-4 font-display text-[20px] font-semibold tracking-[0.14em] uppercase">
            {primaryLabel}
          </span>
        </button>

        <div className="mt-2.5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setNoteOpen((v) => !v)}
            className="text-[12px] text-muted-foreground"
          >
            + {t.session.addNote}
          </button>
          {nextHint && (
            <button
              type="button"
              onClick={() => (isLast ? finish() : moveTo(exIndex + 1))}
              className="text-[11px] tracking-[0.12em] text-muted-foreground uppercase"
            >
              {nextHint} →
            </button>
          )}
        </div>
      </div>

      {/* Rest bottom sheet */}
      {restVisible && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(10,8,6,0.55)", animation: `fadeIn 0.25s ease both` }}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-lg flex-col items-center rounded-t-[28px] bg-popover px-[22px] pt-[18px] pb-[max(env(safe-area-inset-bottom),40px)]"
            style={{
              boxShadow: "0 -12px 40px rgba(0,0,0,0.5)",
              animation: `sheetUp 0.35s ${EASE} both`,
            }}
          >
            <div className="h-1 w-10 rounded-full bg-foreground/[0.18]" />
            <div className="mt-4 flex items-center gap-2">
              <RestIcon />
              <span className="font-semibold text-[11px] tracking-[0.24em] text-muted-foreground uppercase">
                {transition ? t.session.transition : t.session.resting}
              </span>
            </div>
            <div className="mt-1.5 font-display text-[110px] font-bold leading-none tracking-[0.02em] tabular-nums">
              {fmtClock(restRemaining)}
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${restPct}%`, transition: "width 0.25s linear" }}
              />
            </div>
            {!transition && lastSet && (
              <div className="mt-3.5 flex items-center gap-1.5">
                <Check className="size-[13px] text-success" strokeWidth={3} />
                <span className="text-[13px] text-secondary-foreground">
                  {t.session.set} {cur.length} {t.session.loggedDash} {pre}
                  {formatWeight(lastSet.weightKg)} {t.session.kg} × {lastSet.reps}
                </span>
              </div>
            )}
            <p className="mt-1.5 text-[12px] tracking-[0.14em] text-muted-foreground uppercase">
              {transition ? (
                <>
                  {t.session.upNext} · {transition}
                </>
              ) : (
                <>
                  {t.session.upNext} · {t.session.set} {cur.length + 1}{" "}
                  {t.session.of} {effSets}
                </>
              )}
            </p>
            <div className="mt-[18px] grid w-full grid-cols-2 gap-2.5">
              <SheetButton
                onClick={() => {
                  setRestEnd((e) => (e ?? Date.now()) + 30000);
                  setRestTotal((s) => s + 30);
                }}
              >
                <Plus className="size-3.5" strokeWidth={2.4} />
                {t.session.sec30.toUpperCase()}
              </SheetButton>
              <SheetButton
                onClick={() => {
                  setRestEnd(null);
                  setTransition(null);
                }}
              >
                <SkipForward className="size-3.5" strokeWidth={2.4} />
                {t.session.skip.toUpperCase()}
              </SheetButton>
            </div>
          </div>
        </>
      )}

      {/* Rest-over flash — non-interactive, auto-dismisses */}
      {flashVisible && (
        <div
          className="pointer-events-none fixed inset-x-[22px] bottom-9 z-30 mx-auto flex max-w-[calc(32rem-44px)] items-center justify-center gap-2.5 rounded-[14px] bg-success px-[18px] py-4"
          style={{ animation: `riseIn 0.3s ${EASE} both, goPulse 1.1s ease 2` }}
        >
          <Check className="size-4 text-success-foreground" strokeWidth={3} />
          <span className="font-display text-[19px] font-semibold tracking-[0.16em] text-success-foreground uppercase">
            {t.session.restOver} {t.session.set}{" "}
            {Math.min(cur.length + 1, effSets)} · {t.session.go}
          </span>
        </div>
      )}
    </div>
  );
}

/** m:ss, never negative. */
function fmtClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function RestIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 13l3-3.5" />
      <path d="M9 3.5h6" />
    </svg>
  );
}

function Stepper({
  label,
  value,
  onDec,
  onInc,
  decLabel,
  incLabel,
  editValue,
  editLabel,
  onEditCommit,
  footer,
}: {
  label: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
  decLabel: string;
  incLabel: string;
  /** When set, the value becomes tappable to type an exact number. */
  editValue?: number;
  editLabel?: string;
  onEditCommit?: (n: number) => void;
  /** Optional control rendered under the +/- buttons (e.g. a step selector). */
  footer?: React.ReactNode;
}) {
  const editable = onEditCommit != null && editValue != null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    const n = parseFloat(draft.replace(",", "."));
    if (Number.isFinite(n)) onEditCommit?.(n);
    setEditing(false);
  };

  return (
    <div className="flex flex-col items-center gap-[7px] rounded-[16px] bg-card px-3 py-3.5">
      <span className="text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
        {label}
      </span>
      {editing ? (
        <input
          autoFocus
          type="number"
          inputMode="decimal"
          step="any"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") setEditing(false);
          }}
          className="w-full bg-transparent text-center font-display text-[40px] font-bold leading-none tabular-nums outline-none"
        />
      ) : editable ? (
        <button
          type="button"
          aria-label={editLabel}
          onClick={() => {
            setDraft(String(editValue));
            setEditing(true);
          }}
          className="font-display text-[40px] font-bold leading-none tabular-nums"
        >
          {value}
        </button>
      ) : (
        <span className="font-display text-[40px] font-bold leading-none tabular-nums">
          {value}
        </span>
      )}
      <div className="flex w-full gap-2">
        <button
          type="button"
          aria-label={decLabel}
          onClick={onDec}
          className="flex h-11 flex-1 items-center justify-center rounded-[11px] bg-foreground/[0.07] active:bg-foreground/[0.16]"
        >
          <Minus className="size-4" strokeWidth={2.4} />
        </button>
        <button
          type="button"
          aria-label={incLabel}
          onClick={onInc}
          className="flex h-11 flex-1 items-center justify-center rounded-[11px] bg-foreground/[0.07] active:bg-foreground/[0.16]"
        >
          <Plus className="size-4" strokeWidth={2.4} />
        </button>
      </div>
      {footer}
    </div>
  );
}

const WEIGHT_STEPS = [1, 1.25, 2.5, 5] as const;

/** Compact pill row to pick the weight increment for the +/- buttons. */
function StepSelect({
  step,
  onSelect,
  label,
  unit,
}: {
  step: number;
  onSelect: (n: number) => void;
  label: string;
  unit: string;
}) {
  return (
    <div className="flex w-full items-center justify-center gap-1">
      <span className="mr-0.5 text-[8px] tracking-[0.16em] text-muted-foreground uppercase">
        {label}
      </span>
      {WEIGHT_STEPS.map((s) => (
        <button
          key={s}
          type="button"
          aria-label={`${label} ${formatWeight(s)} ${unit}`}
          aria-pressed={s === step}
          onClick={() => onSelect(s)}
          className={`rounded-[7px] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors ${
            s === step
              ? "bg-primary text-primary-foreground"
              : "bg-foreground/[0.07] text-muted-foreground active:bg-foreground/[0.16]"
          }`}
        >
          {formatWeight(s)}
        </button>
      ))}
    </div>
  );
}

/** A logged-set row: swipe left to reveal Delete, tap to open the editor. */
function SwipeableSetRow({
  index,
  set,
  pre,
  t,
  canModify,
  onEdit,
  onDelete,
}: {
  index: number;
  set: LoggedSetRow;
  pre: string;
  t: ReturnType<typeof useT>;
  canModify: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const OPEN = -80;
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ startX: 0, baseX: 0, active: false, moved: false });

  const onPointerDown = (e: React.PointerEvent) => {
    if (!canModify) return;
    drag.current = { startX: e.clientX, baseX: dx, active: true, moved: false };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    const delta = e.clientX - d.startX;
    if (Math.abs(delta) > 4) d.moved = true;
    setDx(Math.max(OPEN, Math.min(0, d.baseX + delta)));
  };
  const endDrag = () => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    setDragging(false);
    // A tap (no real drag) opens the editor; a completed swipe snaps open/shut.
    if (!d.moved) {
      onEdit();
      setDx(0);
      return;
    }
    setDx(dx < OPEN / 2 ? OPEN : 0);
  };

  return (
    <div className="relative" style={{ animation: `riseIn 0.28s ${EASE} both` }}>
      <button
        type="button"
        aria-label={t.session.deleteSet}
        onClick={onDelete}
        className="absolute inset-y-0 right-0 flex w-[80px] items-center justify-center rounded-r-[12px] bg-destructive text-white"
      >
        <Trash2 className="size-4" strokeWidth={2.2} />
      </button>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          transform: `translateX(${dx}px)`,
          touchAction: "pan-y",
          transition: dragging ? "none" : "transform 0.2s ease",
        }}
        className="relative flex items-center gap-3 rounded-[12px] bg-card px-3.5 py-2.5"
      >
        <span className="w-[38px] text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          {t.session.set} {index + 1}
        </span>
        <span className="flex-1 font-display text-[19px] font-semibold tracking-[0.04em]">
          {pre}
          {formatWeight(set.weightKg)} {t.session.kg.toUpperCase()} × {set.reps}
        </span>
        <Check className="size-3.5 text-success" strokeWidth={3} />
      </div>
    </div>
  );
}

/** Inline editor for one logged set — reuses the weight/reps Steppers. */
function SetEditor({
  index,
  set,
  pre,
  t,
  onSave,
  onCancel,
}: {
  index: number;
  set: LoggedSetRow;
  pre: string;
  t: ReturnType<typeof useT>;
  onSave: (weightKg: number, reps: number) => void;
  onCancel: () => void;
}) {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const [w, setW] = useState(set.weightKg);
  const [r, setR] = useState(set.reps);

  return (
    <div
      className="rounded-[12px] bg-card p-2.5 ring-1 ring-input"
      style={{ animation: `riseIn 0.2s ${EASE} both` }}
    >
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <Pencil className="size-3 text-muted-foreground" strokeWidth={2.2} />
        <span className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          {t.session.editSet} · {t.session.set} {index + 1}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Stepper
          label={t.session.weightKgLabel}
          value={`${pre}${formatWeight(w)}`}
          onDec={() => setW((x) => Math.max(0, round2(x - 2.5)))}
          onInc={() => setW((x) => round2(x + 2.5))}
          decLabel={`${t.session.decrease} ${t.session.kg}`}
          incLabel={`${t.session.increase} ${t.session.kg}`}
          editValue={w}
          editLabel={t.session.editWeightLabel}
          onEditCommit={(n) => setW(Math.max(0, round2(n)))}
        />
        <Stepper
          label={t.session.repsLabel}
          value={String(r)}
          onDec={() => setR((x) => Math.max(0, x - 1))}
          onInc={() => setR((x) => x + 1)}
          decLabel={`${t.session.decrease} ${t.session.reps}`}
          incLabel={`${t.session.increase} ${t.session.reps}`}
        />
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="flex h-11 items-center justify-center rounded-[11px] bg-foreground/[0.07] font-display text-[15px] font-semibold tracking-[0.1em] uppercase active:bg-foreground/[0.16]"
        >
          {t.common.cancel}
        </button>
        <button
          type="button"
          onClick={() => onSave(w, r)}
          className="flex h-11 items-center justify-center rounded-[11px] bg-primary font-display text-[15px] font-semibold tracking-[0.1em] text-primary-foreground uppercase active:scale-[0.98]"
        >
          {t.common.save}
        </button>
      </div>
    </div>
  );
}

function SheetButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[52px] items-center justify-center gap-2 rounded-[13px] bg-foreground/[0.08] font-display text-[17px] font-semibold tracking-[0.12em] active:bg-foreground/[0.16]"
    >
      {children}
    </button>
  );
}

function ReceiptScreen({
  dayName,
  weekNumber,
  weekday,
  receipt,
  exerciseCount,
  weekDone,
  weekTotal,
  nextDay,
  onDone,
  onContinue,
}: {
  dayName: string;
  weekNumber: number;
  weekday: number | null;
  receipt: Receipt;
  exerciseCount: number;
  weekDone: number;
  weekTotal: number;
  nextDay: { name: string; weekday: number } | null;
  onDone: () => void;
  onContinue: () => void;
}) {
  const t = useT();
  return (
    <div
      className="-mx-4 -mt-5 -mb-28 flex min-h-dvh flex-col pt-[max(env(safe-area-inset-top),12px)]"
      style={{ animation: `riseIn 0.45s ${EASE} both` }}
    >
      {/* Hero */}
      <div className="flex flex-col items-center px-[22px] pt-[30px] text-center">
        <span style={{ animation: `flamePop 0.55s ${EASE} 0.15s both` }}>
          <Flame className="size-[34px] text-primary" fill="currentColor" />
        </span>
        <span className="mt-3 font-semibold text-[11px] tracking-[0.26em] text-muted-foreground uppercase">
          {t.receipt.complete}
        </span>
        <h1 className="mt-2 font-display text-[54px] font-bold leading-[0.92] tracking-[0.02em] uppercase">
          {shortDayName(dayName)}
          <br />
          <span className="text-primary">{t.receipt.forged}</span>
        </h1>
        <p className="mt-2.5 text-[12px] tracking-[0.16em] text-muted-foreground uppercase">
          {t.session.week} {weekNumber}
          {weekday != null ? ` · ${t.weekdays[weekday]}` : ""}
          {receipt.durationMin != null
            ? ` · ${receipt.durationMin} ${t.receipt.min}`
            : ""}
        </p>
      </div>

      {/* Stat cards */}
      <div
        className="mx-[22px] mt-[22px] grid grid-cols-2 gap-2.5"
        style={{ animation: `riseIn 0.4s ${EASE} 0.2s both` }}
      >
        <ReceiptStat value={receipt.volumeT} unit=" t" label={t.receipt.volumeMoved} />
        <ReceiptStat
          value={String(receipt.totalSets)}
          unit={` ${receipt.totalSets === 1 ? t.receipt.setOne : t.receipt.sets}`}
          label={`${exerciseCount} ${exerciseCount === 1 ? t.receipt.exerciseOne : t.receipt.exercises}`}
        />
      </div>

      {/* Highlights */}
      {receipt.highlights.length > 0 && (
        <div
          className="mx-[22px] mt-[18px] flex flex-col gap-2.5"
          style={{ animation: `riseIn 0.4s ${EASE} 0.32s both` }}
        >
          <span className="font-semibold text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
            {t.receipt.highlights}
          </span>
          {receipt.highlights.map((h) => (
            <div
              key={h.name}
              className="flex items-center justify-between gap-2.5"
            >
              <span className="text-[14px] font-semibold">{h.name}</span>
              <span
                className={`font-display text-[15px] font-semibold tracking-[0.08em] uppercase ${
                  h.kind === "HELD" ? "text-muted-foreground" : "text-success"
                }`}
              >
                {h.tag}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Week card */}
      <div
        className="mx-[22px] mt-5 flex items-center justify-between gap-3 rounded-[14px] bg-card px-4 py-3.5"
        style={{ animation: `riseIn 0.4s ${EASE} 0.44s both` }}
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] tracking-[0.18em] text-muted-foreground uppercase">
            {t.session.week} {weekNumber}
          </span>
          <span className="text-[13px] font-semibold">
            {weekDone} {t.session.of} {weekTotal} {t.receipt.sessionsDone}
          </span>
        </div>
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${weekTotal}, 14px)` }}
        >
          {Array.from({ length: weekTotal }).map((_, i) => (
            <div
              key={i}
              className={`h-[5px] rounded-[3px] ${i < weekDone ? "bg-success" : "bg-foreground/[0.12]"}`}
            />
          ))}
        </div>
      </div>

      {/* Done */}
      <div
        className="mt-auto px-[22px] pb-[max(env(safe-area-inset-bottom),40px)] pt-5"
        style={{ animation: `riseIn 0.4s ${EASE} 0.56s both` }}
      >
        <button
          type="button"
          onClick={onDone}
          className="flex h-[56px] w-full items-center justify-center rounded-[14px] bg-primary text-primary-foreground transition-transform active:scale-[0.98]"
        >
          <span className="font-display text-[20px] font-semibold tracking-[0.14em] uppercase">
            {t.receipt.done}
          </span>
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="mt-2.5 flex h-[48px] w-full items-center justify-center gap-1.5 rounded-[14px] bg-foreground/[0.08] text-muted-foreground active:bg-foreground/[0.16]"
        >
          <ChevronLeft className="size-4" strokeWidth={2.4} />
          <span className="font-display text-[15px] font-semibold tracking-[0.12em] uppercase">
            {t.session.continueWorkout}
          </span>
        </button>
        {nextDay && (
          <p className="mt-3 text-center text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
            {t.receipt.next} · {shortDayName(nextDay.name)} ·{" "}
            {t.weekdays[nextDay.weekday]}
          </p>
        )}
      </div>
    </div>
  );
}

function ReceiptStat({
  value,
  unit,
  label,
}: {
  value: string;
  unit: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-[14px] bg-card px-4 py-4">
      <span className="font-display text-[34px] font-bold leading-none">
        {value}
        <span className="text-[17px] text-muted-foreground">{unit}</span>
      </span>
      <span className="text-[9px] tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  );
}

type WakeLockLike = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockLike> };
};

/** Keep the screen awake during a session; re-acquire when the tab refocuses. */
function useWakeLock() {
  const sentinelRef = useRef<WakeLockLike | null>(null);
  useEffect(() => {
    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock) return;
    let released = false;
    const acquire = async () => {
      try {
        sentinelRef.current = (await nav.wakeLock!.request("screen")) ?? null;
      } catch {
        /* user/agent may reject — non-fatal */
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && !released) acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisibility);
      sentinelRef.current?.release().catch(() => {});
      sentinelRef.current = null;
    };
  }, []);
}
