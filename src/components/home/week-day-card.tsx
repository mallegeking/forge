"use client";

import { Check } from "lucide-react";
import { startSessionAction } from "@/app/actions";
import { shortDayName } from "@/lib/format";
import { useT } from "@/components/i18n/i18n-provider";

// One week-rail card. Today starts (or resumes) its session directly; any
// other day asks first — "train anyway" stays one tap, accidents don't.
export function WeekDayCard({
  dayId,
  dayName,
  weekday,
  isToday,
  isDone,
  exerciseCount,
}: {
  dayId: string;
  dayName: string;
  weekday: number;
  isToday: boolean;
  isDone: boolean;
  exerciseCount: number;
}) {
  const t = useT();

  return (
    <form
      action={startSessionAction}
      className="shrink-0"
      onSubmit={(e) => {
        if (isToday) return;
        const msg = `${t.home.trainAnywayPrefix} ${shortDayName(dayName)} ${t.home.trainAnywayMid} ${t.weekdays[weekday]}.`;
        if (!window.confirm(msg)) e.preventDefault();
      }}
    >
      <input type="hidden" name="dayId" value={dayId} />
      <button
        type="submit"
        className={`flex h-[98px] w-[96px] flex-col overflow-hidden rounded-[14px] p-3 text-left ${
          isToday ? "border-[1.5px] border-primary bg-card-active" : "bg-card"
        } ${isDone && !isToday ? "opacity-65" : ""}`}
      >
        <span
          className={`shrink-0 text-[10px] tracking-[0.18em] uppercase ${
            isToday ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {t.weekdaysShort[weekday]}
        </span>
        <span className="mt-1 line-clamp-2 shrink-0 font-display text-[18px] font-semibold leading-none uppercase">
          {shortDayName(dayName)}
        </span>
        <span className="mt-auto flex shrink-0 items-center gap-1 whitespace-nowrap">
          {isDone ? (
            <>
              <Check className="size-[11px] shrink-0 text-success" strokeWidth={3} />
              <span className="text-[9px] tracking-[0.1em] text-success uppercase">
                {t.home.done}
              </span>
            </>
          ) : isToday ? (
            <span className="text-[9px] tracking-[0.1em] text-primary uppercase">
              {t.home.todayTag}
            </span>
          ) : (
            <span className="text-[9px] tracking-[0.1em] text-muted-foreground uppercase">
              {exerciseCount}{" "}
              {exerciseCount === 1 ? t.home.exercise : t.home.exercises}
            </span>
          )}
        </span>
      </button>
    </form>
  );
}
