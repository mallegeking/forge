import type { Metadata } from "next";
import { BackButton } from "@/components/nav/back-button";
import { LineChart } from "@/components/charts/line-chart";
import { Stats1RmCard } from "@/components/statistics/stats-1rm-card";
import { getActiveProgram, getStatsRows } from "@/lib/queries";
import {
  weeklyVolume,
  consistency,
  prTimeline,
  estimated1RmByExercise,
} from "@/lib/stats";
import { formatSet, formatRelativeDay } from "@/lib/format";
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
  const prs = prTimeline(rows);
  const e1rm = estimated1RmByExercise(rows);

  const shortDate = (d: Date) =>
    d.toLocaleDateString(locale, { day: "numeric", month: "short" });

  // Volume as tonnes (kg/1000) — the y-axis reads "12.3 t".
  const volumeData = volume.map((v) => ({
    label: shortDate(v.weekStart),
    value: Math.round((v.volumeKg / 1000) * 10) / 10,
  }));
  const maxWeekCount = cons.weeklyCounts.reduce(
    (m, w) => Math.max(m, w.count),
    0
  );

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
            <div className="flex h-16 items-end gap-1">
              {cons.weeklyCounts.slice(-14).map((w) => (
                <div
                  key={w.weekStart.getTime()}
                  className="flex-1 rounded-t-[3px] bg-primary/70"
                  style={{
                    height: `${maxWeekCount ? Math.max((w.count / maxWeekCount) * 100, 8) : 0}%`,
                  }}
                  title={`${shortDate(w.weekStart)} · ${w.count}`}
                />
              ))}
            </div>
          </section>

          {/* PR timeline */}
          <section>
            <h2 className="mb-2 font-semibold text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
              {t.statistics.prs}
            </h2>
            {prs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t.statistics.noPrs}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {[...prs].reverse().map((pr, i) => (
                  <li
                    key={`${pr.performedAt.getTime()}-${pr.exerciseName}-${i}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="min-w-0 truncate text-[13px] text-foreground/75">
                      {pr.exerciseName}
                    </span>
                    <span className="shrink-0">
                      <span className="font-display text-[16px] font-semibold tracking-[0.06em] text-success">
                        {formatSet(pr.weightKg, pr.reps)}
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        {" "}
                        · {formatRelativeDay(pr.performedAt, t.common, locale)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

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
