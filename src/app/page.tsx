import Link from "next/link";
import {
  getActiveProgram,
  getProgramDays,
  getProgramDayCounts,
  getCoachingInput,
  getHomeLedger,
  getCompletedDayIdsThisWeek,
  getBodyweightEntries,
  isoWeekday,
} from "@/lib/queries";
import { getSetting } from "@/lib/mutations";
import { computeTrainingWeek, isDeloadWeek } from "@/lib/progression";
import { buildCoachNote } from "@/lib/coach";
import { weeklyAverages } from "@/lib/bodyweight";
import { getNutritionConfig } from "@/lib/nutrition-config";
import { formatWeight, shortDayName } from "@/lib/format";
import { getDict } from "@/lib/i18n/server";
import {
  startSessionAction,
  logoutAction,
  postponeDeloadAction,
} from "@/app/actions";
import {
  Flame,
  SlidersHorizontal,
  LockKeyhole,
  ArrowRight,
  Check,
  Moon,
} from "lucide-react";

// Reads the database and resolves "today" — must render per request, never
// prerendered at build time (which would freeze the weekday and the data).
export const dynamic = "force-dynamic";

/** A tiny inline sparkline path over `values`, scaled to a w×h box. */
function sparklinePath(values: number[], w: number, h: number): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export default async function Home() {
  const [program, t] = await Promise.all([getActiveProgram(), getDict()]);

  if (!program) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-xl font-semibold">{t.home.noProgramTitle}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t.home.noProgramBefore}{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">npm run db:seed</code>{" "}
          {t.home.noProgramAfter}
        </p>
      </div>
    );
  }

  const [
    days,
    counts,
    startIso,
    postponedWeek,
    snapshot,
    ledger,
    completedDayIds,
    bwEntries,
    nutrition,
  ] = await Promise.all([
    getProgramDays(program.id),
    getProgramDayCounts(program.id),
    getSetting("trainingStartDate"),
    getSetting("deloadPostponedWeek"),
    getCoachingInput(),
    getHomeLedger(program.id),
    getCompletedDayIdsThisWeek(program.id),
    getBodyweightEntries(),
    getNutritionConfig(),
  ]);

  // Proactive, no-AI coach note: lifts that hit the top of their range and are
  // ready for more load. Plateaus are surfaced too (problems first).
  const note = snapshot ? buildCoachNote(snapshot) : null;
  const noteItems = note
    ? [
        ...note.plateau.map((p) => ({
          key: `p-${p.name}`,
          name: p.name,
          tag: `${p.sessions} ${t.coachNote.sessions}`,
          good: false,
        })),
        ...note.ready.map((r) => ({
          key: `r-${r.name}`,
          name: r.name,
          tag: `+${r.incMin} ${t.home.kgReady}`,
          good: true,
        })),
      ].slice(0, 3)
    : [];
  const readyCount = note?.ready.length ?? 0;

  const today = isoWeekday();
  const todayDay = days.find((d) => d.dayOfWeek === today) ?? null;
  const week = startIso
    ? computeTrainingWeek(new Date(startIso), new Date())
    : null;
  const deload =
    week != null && isDeloadWeek(week) && postponedWeek !== String(week);
  const completedToday = todayDay ? completedDayIds.has(todayDay.id) : false;
  const weekDoneCount = completedDayIds.size;

  // Bodyweight mini: latest weekly average, this-week delta, and a sparkline.
  const bwPoints = weeklyAverages(
    bwEntries.map((e) => ({ weightKg: e.weightKg, measuredAt: e.measuredAt }))
  );
  const latestBw = bwPoints.at(-1)?.avgWeightKg ?? null;
  const prevBw = bwPoints.at(-2)?.avgWeightKg ?? null;
  const bwDelta = latestBw != null && prevBw != null ? latestBw - prevBw : null;
  const spark = sparklinePath(
    bwPoints.slice(-7).map((p) => p.avgWeightKg),
    52,
    18
  );
  const goal = nutrition.config.goal;
  // A change "in the right direction" for the goal is the green case.
  const bwGood =
    bwDelta == null
      ? true
      : goal === "gain"
        ? bwDelta >= 0
        : goal === "cut"
          ? bwDelta <= 0
          : Math.abs(bwDelta) < 0.3;

  return (
    // Cancel the layout's 16px gutter / top pad so the screen runs to a true
    // 22px gutter and the week rail can bleed to the edge, per the design.
    <div className="-mx-4 -mt-5 animate-[fadeIn_0.3s_ease]">
      {/* Header */}
      <header className="flex items-center justify-between px-[22px] pt-2">
        <div className="flex items-center gap-2">
          <Flame className="size-4 text-primary" fill="currentColor" />
          <span className="font-display text-xl font-bold tracking-[0.18em]">
            FORGE
          </span>
        </div>
        <div className="flex items-center gap-3.5 text-muted-foreground">
          <Link
            href="/settings"
            aria-label={t.home.settings}
            className="transition-colors hover:text-foreground"
          >
            <SlidersHorizontal className="size-[17px]" />
          </Link>
          <form action={logoutAction} className="flex">
            <button
              type="submit"
              aria-label={t.home.lockApp}
              className="transition-colors hover:text-foreground"
            >
              <LockKeyhole className="size-4" />
            </button>
          </form>
        </div>
      </header>

      {/* Today block */}
      <section className="px-[22px] pt-[22px]">
        <p className="font-semibold text-[12px] tracking-[0.22em] text-primary uppercase">
          {todayDay
            ? week != null
              ? `${t.weekdays[today]} — ${t.home.week} ${week}`
              : t.weekdays[today]
            : t.home.restDayEyebrow}
        </p>
        <h1 className="mt-2 font-display text-[56px] font-bold leading-[0.92] tracking-[0.01em] uppercase">
          {todayDay ? shortDayName(todayDay.name) : t.home.restDayTitle}
        </h1>
        <p className="mt-2.5 text-[12px] tracking-[0.18em] text-muted-foreground uppercase">
          {todayDay
            ? readyCount > 0
              ? `${counts.get(todayDay.id) ?? 0} ${t.home.exercises} · ${readyCount} ${t.home.liftsReady}`
              : `${counts.get(todayDay.id) ?? 0} ${t.home.exercises}`
            : t.home.restDayBody}
        </p>

        {deload && (
          <div className="mt-3.5 flex items-center justify-between gap-2 rounded-[12px] bg-card px-3.5 py-2.5">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Moon className="size-3.5 shrink-0" />
              {t.home.deloadNotice}
            </span>
            <form action={postponeDeloadAction}>
              <button
                type="submit"
                className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
              >
                {t.home.postpone}
              </button>
            </form>
          </div>
        )}

        {todayDay &&
          (completedToday ? (
            <div className="mt-3.5 flex h-[50px] items-center justify-center gap-2 rounded-[12px] border-[1.5px] border-success/40">
              <Check className="size-[15px] text-success" strokeWidth={3} />
              <span className="font-display text-[19px] font-semibold tracking-[0.14em] text-success uppercase">
                {t.home.forgedToday}
              </span>
            </div>
          ) : (
            <form action={startSessionAction} className="mt-3.5">
              <input type="hidden" name="dayId" value={todayDay.id} />
              <button
                type="submit"
                className="flex h-[50px] w-full items-center justify-center gap-2.5 rounded-[12px] bg-primary text-primary-foreground transition-transform active:scale-[0.98]"
              >
                <span className="font-display text-[19px] font-semibold tracking-[0.14em] uppercase">
                  {t.home.startWorkout}
                </span>
                <ArrowRight className="size-4" strokeWidth={2.6} />
              </button>
            </form>
          ))}
      </section>

      {/* Coach's note */}
      {noteItems.length > 0 && (
        <section className="mx-[22px] mt-3.5 border-t border-foreground/10 pt-3.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
              {t.home.coachNoteLabel}
            </span>
            <Link
              href={`/coach?ask=${encodeURIComponent(t.coach.analyzePrompt)}`}
              className="font-semibold text-[11px] tracking-[0.12em] text-primary uppercase"
            >
              {t.home.ask}
            </Link>
          </div>
          <ul className="mt-2.5 flex flex-col gap-[7px]">
            {noteItems.map((item) => (
              <li
                key={item.key}
                className="flex items-baseline justify-between gap-2.5"
              >
                <span className="text-sm font-semibold">{item.name}</span>
                <span
                  className={`font-display text-[15px] font-semibold tracking-[0.08em] uppercase ${
                    item.good ? "text-success" : "text-muted-foreground"
                  }`}
                >
                  {item.tag}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Ledger card */}
      {ledger && (
        <section className="mx-[22px] mt-3.5 rounded-[14px] bg-card px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="shrink-0 font-semibold text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
              {t.home.lastSession} · {t.weekdaysShort[ledger.weekday]}
            </span>
            <span className="min-w-0 truncate font-semibold text-[11px] tracking-[0.12em] text-primary uppercase">
              {shortDayName(ledger.dayName)}
            </span>
          </div>
          <div className="mt-2.5 grid grid-cols-3 gap-2.5">
            <Stat
              value={(ledger.volumeKg / 1000).toFixed(1)}
              unit=" t"
              label={t.home.volumeMoved}
            />
            <Stat
              value={ledger.durationMin != null ? String(ledger.durationMin) : "—"}
              unit={` ${t.home.minShort}`}
              label={t.home.duration}
            />
            <div className="flex flex-col gap-0.5">
              <span className="font-display text-[24px] font-bold leading-none text-success">
                {ledger.prCount}
                <span className="text-[14px]"> {t.home.prShort}</span>
              </span>
              <span className="text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
                {t.home.records}
              </span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3">
            {/* Bodyweight 7d */}
            <div className="flex flex-col gap-1">
              <span className="text-[9px] tracking-[0.18em] text-muted-foreground uppercase">
                {t.home.bodyweight7d}
              </span>
              <div className="flex items-end justify-between gap-2">
                <span className="font-display text-[22px] font-bold leading-none">
                  {latestBw != null ? formatWeight(latestBw) : "—"}
                  <span className="text-[13px] text-muted-foreground"> kg</span>
                </span>
                {spark && (
                  <svg width="52" height="18" viewBox="0 0 52 18" fill="none">
                    <path
                      d={spark}
                      stroke="var(--primary)"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
              {bwDelta != null && (
                <span
                  className={`text-[10px] ${bwGood ? "text-success" : "text-muted-foreground"}`}
                >
                  {bwDelta > 0 ? "+" : bwDelta < 0 ? "−" : ""}
                  {formatWeight(Math.abs(bwDelta))} kg {t.home.thisWeek}
                </span>
              )}
            </div>

            {/* Protein target */}
            <div className="flex flex-col gap-1">
              <span className="text-[9px] tracking-[0.18em] text-muted-foreground uppercase">
                {t.home.proteinTarget}
              </span>
              <span className="font-display text-[22px] font-bold leading-none">
                {nutrition.targets ? nutrition.targets.proteinG : "—"}
                <span className="text-[13px] text-muted-foreground"> g</span>
              </span>
              {nutrition.latestWeightKg != null && (
                <span className="text-[10px] text-muted-foreground">
                  {t.nutrition.goalLabels[goal]} · {t.home.proteinBasis}{" "}
                  {formatWeight(nutrition.latestWeightKg)} kg
                </span>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Week rail */}
      <section className="mt-5">
        <div className="flex items-center justify-between px-[22px]">
          <span className="font-semibold text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
            {t.home.theWeek}
          </span>
          <span className="font-display text-[15px] font-semibold tracking-[0.1em]">
            {weekDoneCount}{" "}
            <span className="text-muted-foreground">
              / {days.length} {t.home.weekDone.toUpperCase()}
            </span>
          </span>
        </div>
        <div className="mt-2.5 flex gap-2 overflow-x-auto px-[22px] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {days.map((day) => {
            const isDone = completedDayIds.has(day.id);
            const isToday = day.dayOfWeek === today;
            return (
              <form key={day.id} action={startSessionAction} className="shrink-0">
                <input type="hidden" name="dayId" value={day.id} />
                <button
                  type="submit"
                  className={`flex h-[98px] w-[96px] flex-col overflow-hidden rounded-[14px] p-3 text-left ${
                    isToday
                      ? "border-[1.5px] border-primary bg-card-active"
                      : "bg-card"
                  } ${isDone && !isToday ? "opacity-65" : ""}`}
                >
                  <span
                    className={`shrink-0 text-[10px] tracking-[0.18em] uppercase ${
                      isToday ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {t.weekdaysShort[day.dayOfWeek]}
                  </span>
                  <span className="mt-1 line-clamp-2 shrink-0 font-display text-[18px] font-semibold leading-none uppercase">
                    {shortDayName(day.name)}
                  </span>
                  <span className="mt-auto flex shrink-0 items-center gap-1 whitespace-nowrap">
                    {isDone ? (
                      <>
                        <Check
                          className="size-[11px] shrink-0 text-success"
                          strokeWidth={3}
                        />
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
                        {counts.get(day.id) ?? 0} {t.home.exercises}
                      </span>
                    )}
                  </span>
                </button>
              </form>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** One ledger headline stat: a condensed value with a small unit + caption. */
function Stat({
  value,
  unit,
  label,
}: {
  value: string;
  unit: string;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-display text-[24px] font-bold leading-none">
        {value}
        <span className="text-[14px] text-muted-foreground">{unit}</span>
      </span>
      <span className="text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  );
}
