import { weekStartOf } from "@/lib/stats";

// GitHub-style training calendar: one column per week (Monday-first), one cell
// per day, intensity = sessions that day. Renders on the server — the grid is
// static markup, no interaction. Gaps and streaks read at a glance, which is
// the job the sessions-per-week bars used to do less directly.
const WEEKS = 16;
const DAY = 24 * 60 * 60 * 1000;

export function ConsistencyHeatmap({
  countsByDay,
  now,
  locale,
  title,
  totalLabel,
}: {
  /** Sessions per local day, keyed by that day's midnight timestamp. */
  countsByDay: Map<number, number>;
  now: Date;
  locale: string;
  title: string;
  /** Pre-formatted total, e.g. "14 Workouts". */
  totalLabel: string;
}) {
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const start = weekStartOf(now).getTime() - (WEEKS - 1) * 7 * DAY;

  const columns = Array.from({ length: WEEKS }, (_, w) => {
    const monday = new Date(start + w * 7 * DAY);
    return {
      monday,
      days: Array.from({ length: 7 }, (_, d) => {
        const t = start + (w * 7 + d) * DAY;
        return { t, count: countsByDay.get(t) ?? 0, future: t > today };
      }),
    };
  });

  const cellClass = (count: number, future: boolean) => {
    if (future) return "bg-transparent";
    if (count === 0) return "bg-foreground/[0.05]";
    if (count === 1) return "bg-primary/60";
    return "bg-primary";
  };

  return (
    <section className="rounded-[16px] bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          {title}
        </p>
        <p className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
          {totalLabel}
        </p>
      </div>

      {/* Month labels, one slot per week column. */}
      <div className="mb-1 flex gap-[3px]">
        {columns.map((c, i) => {
          const month = c.monday.getMonth();
          const changed = i === 0 || month !== columns[i - 1].monday.getMonth();
          return (
            <span
              key={c.monday.getTime()}
              className="min-w-0 flex-1 overflow-visible text-[8px] whitespace-nowrap text-muted-foreground"
            >
              {changed &&
                c.monday.toLocaleDateString(locale, { month: "short" })}
            </span>
          );
        })}
      </div>

      <div className="grid auto-cols-fr grid-flow-col grid-rows-7 gap-[3px]">
        {columns.flatMap((c) =>
          c.days.map((d) => (
            <div
              key={d.t}
              className={`aspect-square w-full rounded-[3px] ${cellClass(d.count, d.future)}`}
              title={`${new Date(d.t).toLocaleDateString(locale, { day: "numeric", month: "short" })} · ${d.count}`}
            />
          ))
        )}
      </div>
    </section>
  );
}
