"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, CheckCircle2 } from "lucide-react";
import { RestTimerProvider } from "@/components/session/rest-timer";
import { ExerciseCard } from "@/components/session/exercise-card";
import { Button } from "@/components/ui/button";
import { finishSessionAction } from "@/app/actions";
import { useT } from "@/components/i18n/i18n-provider";
import type { SessionView as SessionViewData } from "@/lib/queries";

export function SessionView({ view }: { view: SessionViewData }) {
  const t = useT();
  useWakeLock();
  const completed = view.session.completedAt != null;

  return (
    <RestTimerProvider>
      <header className="mb-4 flex items-center gap-2">
        <Link
          href="/"
          aria-label={t.common.back}
          className="-ml-2 flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {view.dayName}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t.session.week} {view.session.weekNumber}
            {view.session.isDeload && ` · ${t.session.deload}`}
            {completed && ` · ${t.session.completed}`}
          </p>
        </div>
        {completed && <CheckCircle2 className="size-5 text-success" />}
      </header>

      <div className="flex flex-col gap-3">
        {view.exercises.map((ex) => (
          <ExerciseCard
            key={ex.prescriptionId}
            ex={ex}
            sessionId={view.session.id}
            isDeload={view.session.isDeload}
          />
        ))}
      </div>

      {!completed && (
        <form action={finishSessionAction} className="mt-4">
          <input type="hidden" name="sessionId" value={view.session.id} />
          <Button type="submit" variant="secondary" className="h-12 w-full text-base">
            {t.session.finish}
          </Button>
        </form>
      )}
    </RestTimerProvider>
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
        /* user/agent may reject (e.g. low battery) — non-fatal */
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
