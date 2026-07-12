import type { Metadata } from "next";
import { BackButton } from "@/components/nav/back-button";
import { LineChart } from "@/components/charts/line-chart";
import { Stats1RmCard } from "@/components/statistics/stats-1rm-card";
import { PrList } from "@/components/statistics/pr-list";
import { getActiveProgram, getStatsRows } from "@/lib/queries";
import {
  weeklyVolume,
  consistency,
  exerciseBests,
  estimated1RmByExercise,
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
  const rows = program ? await getStatsRows(program.id) : [];

  const volume = weeklyVolume(rows);
  const cons = consistency(rows);
  const bests = exerciseBests(rows);
  const e1rm = estimated1RmByExercise(rows);

  const shortDate = (d: Date) =>
    d.toLocaleDateString(locale, { day: "numeric", month: "short" });

  // Volume as tonnes (kg/1000) — the y-axis reads "12.3 t".
  const volumeData = volume.map((v) => ({
    label: shortDate(v.weekStart),
    value: Math.round((v.volumeKg / 1000) * 10) / 10,
  }));

  // Last 14 weeks incl. zero-session gaps; the dense series always ends at the
  // current week, so the final bar is "this week".
  const weeks = cons.weeklyCounts.slice(-14);
  const maxWeekCount = weeks.reduce((m, w) => Math.max(m, w.count), 0);
  const maxWeekIdx = weeks.findIndex((w) => w.count === maxWeekCount);

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
          {/* Headline tiles */}
          <div className="grid grid-cols-3 gap-2.5">
            <Tile value={String(cons.totalSessions)} label={t.statistics.totalWorkouts} />
            <Tile value={String(cons.currentWeekStreak)} label={t.statistics.streak} />
            <Tile value={cons.avgPerWeek.toFixed(1)} label={t.statistics.avgPerWeek} />
          </div>

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
          </section>

          {/* Consistency — sessions per week */}
          <section className="rounded-[16px] bg-card p-4">
            <p className="mb-3 text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              {t.statistics.sessionsPerWeek}
            </p>
            <div className="flex h-20 items-end gap-1 border-b border-border">
              {weeks.map((w, i) => {
                const isCurrent = i === weeks.length - 1;
                // Selective labels: only the current week and the best week.
                const labeled =
                  w.count > 0 && (isCurrent || i === maxWeekIdx);
                return (
                  <div
                    key={w.weekStart.getTime()}
                    className="flex flex-1 flex-col items-center justify-end gap-1"
                    title={`${shortDate(w.weekStart)} · ${w.count}`}
                  >
                    {labeled && (
                      <span
                        className={`font-display text-[10px] font-semibold leading-none ${
                          isCurrent ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {w.count}
                      </span>
                    )}
                    {w.count === 0 ? (
                      <div className="h-[2px] w-full max-w-[24px] rounded-full bg-primary/25" />
                    ) : (
                      <div
                        className={`w-full max-w-[24px] rounded-t-[4px] ${
                          isCurrent ? "bg-primary" : "bg-primary/55"
                        }`}
                        style={{
                          height: `${Math.max((w.count / maxWeekCount) * 56, 6)}px`,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-1.5 flex justify-between text-[9px] tracking-[0.08em] text-muted-foreground uppercase">
              <span>{weeks.length > 0 && shortDate(weeks[0].weekStart)}</span>
              <span>{t.statistics.thisWeek}</span>
            </div>
          </section>

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

/** One headline stat tile — big value over a small uppercase caption. */
function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[14px] bg-card px-3 py-3">
      <span className="font-display text-[26px] font-bold leading-none">
        {value}
      </span>
      <span className="text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  );
}
