import Link from "next/link";
import {
  getActiveProgram,
  getProgramDays,
  getProgramDayCounts,
  isoWeekday,
} from "@/lib/queries";
import { getSetting } from "@/lib/mutations";
import { computeTrainingWeek, isDeloadWeek } from "@/lib/progression";
import { weekdayName } from "@/lib/format";
import {
  startSessionAction,
  logoutAction,
  postponeDeloadAction,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dumbbell,
  LockKeyhole,
  ChevronRight,
  CalendarRange,
  Sparkles,
  Moon,
  Scale,
  Settings,
} from "lucide-react";

// Reads the database and resolves "today" — must render per request, never
// prerendered at build time (which would freeze the weekday and the data).
export const dynamic = "force-dynamic";

export default async function Home() {
  const program = await getActiveProgram();

  if (!program) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-xl font-semibold">No program loaded</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Run{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">npm run db:seed</code>{" "}
          to load your 5-day split.
        </p>
      </div>
    );
  }

  const [days, counts, startIso, postponedWeek] = await Promise.all([
    getProgramDays(program.id),
    getProgramDayCounts(program.id),
    getSetting("trainingStartDate"),
    getSetting("deloadPostponedWeek"),
  ]);

  const today = isoWeekday();
  const todayDay = days.find((d) => d.dayOfWeek === today) ?? null;
  const week = startIso
    ? computeTrainingWeek(new Date(startIso), new Date())
    : null;
  const deload =
    week != null && isDeloadWeek(week) && postponedWeek !== String(week);

  return (
    <div>
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Dumbbell className="size-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Forge</span>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/settings"
            aria-label="Settings"
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Settings className="size-4" />
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Lock app"
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LockKeyhole className="size-4" />
            </button>
          </form>
        </div>
      </header>

      {/* Today hero — the day's session is one tap from here. */}
      <Card className="mb-5 gap-0 py-0">
        <div className="flex items-center justify-between px-5 pt-5">
          <span className="text-xs font-medium tracking-wide text-primary uppercase">
            Today · {weekdayName(today)}
          </span>
          {week != null && (
            <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              <CalendarRange className="size-3.5" />
              Week {week}
            </span>
          )}
        </div>

        {deload && (
          <div className="mx-5 mt-3 flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Moon className="size-3.5 shrink-0" />
              Deload week — lighter loads, fewer sets.
            </span>
            <form action={postponeDeloadAction}>
              <button
                type="submit"
                className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
              >
                Postpone
              </button>
            </form>
          </div>
        )}

        {todayDay ? (
          <div className="px-5 pt-2 pb-5">
            <h1 className="text-2xl font-semibold tracking-tight">
              {todayDay.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {counts.get(todayDay.id) ?? 0} exercises
            </p>
            <form action={startSessionAction} className="mt-4">
              <input type="hidden" name="dayId" value={todayDay.id} />
              <Button type="submit" className="h-12 w-full gap-1.5 text-base">
                Start workout
                <ChevronRight className="size-4" />
              </Button>
            </form>
          </div>
        ) : (
          <div className="px-5 pt-2 pb-5">
            <h1 className="text-2xl font-semibold tracking-tight">Rest day</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Recover well — or pick a session below to train anyway.
            </p>
          </div>
        )}
      </Card>

      {/* Coach entry */}
      <Link
        href="/coach"
        className="mb-5 flex items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10 transition-colors hover:bg-muted/40"
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Sparkles className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Ask your coach</p>
          <p className="text-xs text-muted-foreground">
            AI advice from your training history
          </p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>

      {/* Bodyweight entry */}
      <Link
        href="/bodyweight"
        className="mb-5 flex items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10 transition-colors hover:bg-muted/40"
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Scale className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Bodyweight</p>
          <p className="text-xs text-muted-foreground">
            Log weigh-ins · weekly average &amp; trend
          </p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>

      {/* The split */}
      <h2 className="mb-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Training split
      </h2>
      <div className="flex flex-col gap-2">
        {days.map((day) => {
          const isToday = day.dayOfWeek === today;
          return (
            <form key={day.id} action={startSessionAction}>
              <input type="hidden" name="dayId" value={day.id} />
              <button
                type="submit"
                className={`flex w-full items-center gap-3 rounded-xl bg-card p-3 text-left ring-1 transition-colors hover:bg-muted/40 ${
                  isToday ? "ring-primary/50" : "ring-foreground/10"
                }`}
              >
                <div className="flex w-10 shrink-0 flex-col items-center">
                  <span className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">
                    {weekdayName(day.dayOfWeek).slice(0, 3)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{day.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {counts.get(day.id) ?? 0} exercises
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </form>
          );
        })}
      </div>

      <div className="mt-5 text-center">
        <Link
          href="/program"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          View full program →
        </Link>
      </div>
    </div>
  );
}
