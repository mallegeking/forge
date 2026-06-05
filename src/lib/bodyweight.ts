// Pure bodyweight math — daily weigh-ins condensed into weekly averages so the
// trend reads clearly through day-to-day noise (water, food, sleep). No DB here,
// so it unit-tests like the progression engine.

export type BodyweightEntry = { weightKg: number; measuredAt: Date };

export type WeeklyPoint = {
  weekStart: Date;
  /** Short "5 Jun" label for the chart axis. */
  label: string;
  avgWeightKg: number;
  count: number;
};

/** Monday-00:00 local for the week containing `d`. */
function weekStartOf(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const mondayOffset = (date.getDay() + 6) % 7; // 0 = Monday … 6 = Sunday
  date.setDate(date.getDate() - mondayOffset);
  return date;
}

/** Average weigh-ins per ISO week, oldest week first. */
export function weeklyAverages(entries: BodyweightEntry[]): WeeklyPoint[] {
  const byWeek = new Map<number, { weekStart: Date; sum: number; count: number }>();
  for (const e of entries) {
    const start = weekStartOf(e.measuredAt);
    const key = start.getTime();
    const acc = byWeek.get(key);
    if (acc) {
      acc.sum += e.weightKg;
      acc.count += 1;
    } else {
      byWeek.set(key, { weekStart: start, sum: e.weightKg, count: 1 });
    }
  }

  return Array.from(byWeek.values())
    .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
    .map((w) => ({
      weekStart: w.weekStart,
      label: w.weekStart.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      }),
      avgWeightKg: Math.round((w.sum / w.count) * 10) / 10,
      count: w.count,
    }));
}

/** Net change between the first and most recent weekly average (null if <2 weeks). */
export function bodyweightTrend(points: WeeklyPoint[]): number | null {
  if (points.length < 2) return null;
  const delta = points[points.length - 1].avgWeightKg - points[0].avgWeightKg;
  return Math.round(delta * 10) / 10;
}
