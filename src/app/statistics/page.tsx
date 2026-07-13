import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { BackButton } from "@/components/nav/back-button";
import { LineChart } from "@/components/charts/line-chart";
import { Stats1RmCard } from "@/components/statistics/stats-1rm-card";
import { PrList } from "@/components/statistics/pr-list";
import { ConsistencyHeatmap } from "@/components/statistics/consistency-heatmap";
import {
  getActiveProgram,
  getStatsRows,
  getExerciseRepRanges,
} from "@/lib/queries";
import {
  weeklyVolume,
  consistency,
  exerciseBests,
  estimated1RmByExercise,
  fourWeekDeltas,
  dailySessionCounts,
  stalledExercises,
} from "@/lib/stats";
import { formatWeight, formatRelativeDay } from "@/lib/format";
import { getDict, getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Stats · Forge" };
// Reads the database per request — never prerendered.
export const dynamic = "force-dynamic";

export default async function StatisticsPage() {
  const [program, t, locale] = await Promise.all([
    getActiveProgram(),
    getDict(),
    getLocale(),
  ]);
  const [rows, repRanges] = program
    ? await Promise.all([
        getStatsRows(program.id),
        getExerciseRepRanges(program.id),
      ])
    : [[], new Map()];

  const volume = weeklyVolume(rows);
  const cons = consistency(rows);
  const bests = exerciseBests(rows);
  const e1rm = estimated1RmByExercise(rows);
  const now = new Date();
  const d4 = fourWeekDeltas(rows, now);
  const countsByDay = dailySessionCounts(rows);
  const stalled = stalledExercises(rows, repRanges);

  const shortDate = (d: Date) =>
    d.toLocaleDateString(locale, { day: "numeric", month: "short" });

  // Volume as tonnes (kg/1000) — the y-axis reads "12.3 t". Deload weeks draw
  // hollow markers: their dip is planned, not lost progress.
  const volumeData = volume.map((v) => ({
    label: shortDate(v.weekStart),
    value: Math.round((v.volumeKg / 1000) * 10) / 10,
    muted: v.hasDeload,
  }));

  // Tile deltas: last 4 weeks vs the 4 before. Hidden while the program is too
  // young for the prior window to mean anything.
  const tonnes = (kg: number) => `${Math.round((kg / 1000) * 10) / 10} t`;
  const sessionsDelta = d4.sessions.current - d4.sessions.previous;
  const volumeDeltaPct =
    d4.volumeKg.previous > 0
      ? Math.round(
          ((d4.volumeKg.current - d4.volumeKg.previous) / d4.volumeKg.previous) *
            100
        )
      : null;
  const signed = (n: number, suffix = "") =>
    `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n)}${suffix}`;

  const prItems = bests.map((b) => ({
    exerciseId: b.exerciseId,
    name: b.exerciseName,
    value: `${b.isBodyweightPlus ? "+" : ""}${formatWeight(b.weightKg)} ${t.session.kg} × ${b.reps}`,
    day: formatRelativeDay(b.performedAt, t.common, locale),
  }));

  return (
    <div className="-mx-4 -mt-5 animate-[fadeIn_0.3s_ease] px-[22px] pb-2">
      <header className="-mx-[22px] flex items-center gap-2.5 px-[22px] pt-2 pb-[18px]">
        <BackButton
          label={t.common.back}
          className="-m-1.5 shrink-0 p-1.5 text-muted-foreground"
        />
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate font-display text-[17px] font-bold leading-none tracking-[0.14em] uppercase">
            {t.statistics.title}
          </h1>
          <p className="mt-1 truncate text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            {t.statistics.subtitle}
          </p>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {t.statistics.noData}
        </p>
      ) : (
        <div className="flex flex-col gap-[18px]">
          {/* Headline tiles — last-4-weeks deltas, not all-time trivia */}
          <div className="grid grid-cols-3 gap-2.5">
            <Tile
              value={String(d4.sessions.current)}
              label={t.statistics.workouts4w}
              delta={d4.hasPrior ? signed(sessionsDelta) : undefined}
              deltaUp={sessionsDelta >= 0}
            />
            <Tile
              value={tonnes(d4.volumeKg.current)}
              label={t.statistics.volume4w}
              delta={
                d4.hasPrior && volumeDeltaPct != null
                  ? signed(volumeDeltaPct, "%")
                  : undefined
              }
              deltaUp={(volumeDeltaPct ?? 0) >= 0}
            />
            <Tile
              value={String(cons.currentWeekStreak)}
              label={t.statistics.streak}
            />
          </div>

          {/* Stalled lifts — surfaced here so a stall doesn't hide until you
              happen to open that exercise's page */}
          {stalled.length > 0 && (
            <section className="rounded-[16px] bg-card p-4">
              <p className="mb-2.5 text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                {t.statistics.needsAttention}
              </p>
              <ul className="flex flex-col gap-2.5">
                {stalled.map((s) => (
                  <li key={s.exerciseId}>
                    <Link
                      href={`/exercises/${s.exerciseId}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
                        <span className="min-w-0 truncate text-[13px] text-foreground/75">
                          {s.exerciseName}
                        </span>
                      </span>
                      <span className="shrink-0 text-[12px] text-muted-foreground">
                        {t.statistics.stuckAt
                          .replace("{w}", formatWeight(s.weightKg))
                          .replace("{n}", String(s.consecutive))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Volume over time */}
          <section className="rounded-[16px] bg-card p-4">
            <p className="mb-2.5 text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              {t.statistics.volume}
            </p>
            <LineChart
              data={volumeData}
              ariaLabel={t.statistics.volume}
              formatValue={(v) => `${v} t`}
            />
            {volumeData.some((v) => v.muted) && (
              <p className="mt-1 text-[9px] tracking-[0.08em] text-muted-foreground uppercase">
                {t.statistics.deloadHint}
              </p>
            )}
          </section>

          {/* Consistency — training-day heatmap */}
          <ConsistencyHeatmap
            countsByDay={countsByDay}
            now={now}
            locale={locale}
            title={t.statistics.consistency}
            totalLabel={`${cons.totalSessions} ${t.statistics.totalWorkouts}`}
          />

          {/* Personal records — all-time best per exercise, deduplicated */}
          <PrList
            items={prItems}
            labels={{
              title: t.statistics.prs,
              empty: t.statistics.noPrs,
              showAll: t.statistics.showAll,
              showLess: t.statistics.showLess,
            }}
          />


          {/* Estimated 1RM per exercise */}
          <Stats1RmCard series={e1rm} />
        </div>
      )}
    </div>
  );
}

/**
 * One headline stat tile — big value over a small uppercase caption, with an
 * optional signed delta vs the prior four weeks (green up, red down — more
 * training is always the good direction here).
 */
function Tile({
  value,
  label,
  delta,
  deltaUp,
}: {
  value: string;
  label: string;
  delta?: string;
  deltaUp?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[14px] bg-card px-3 py-3">
      <span className="flex items-baseline gap-1.5">
        <span className="font-display text-[26px] font-bold leading-none">
          {value}
        </span>
        {delta && (
          <span
            className={`font-display text-[11px] font-semibold ${
              deltaUp ? "text-success" : "text-destructive"
            }`}
          >
            {delta}
          </span>
        )}
      </span>
      <span className="text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  );
}
