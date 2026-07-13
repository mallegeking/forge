// Pure statistics math — turns the flat set-log stream (one row per logged set,
// joined to its session + exercise) into the aggregate views the stats page
// renders. No DB here, so it unit-tests like the progression / bodyweight math.
//
// Rows are expected oldest-first (the query orders by performedAt asc), but the
// per-session grouping below never assumes intra-session order.

import type { ExerciseType } from "@/db/schema";
import { detectPlateau, type RepRange } from "@/lib/progression";

/** One logged set with the session + exercise context the aggregations need. */
export type StatsRow = {
  sessionId: string;
  performedAt: Date;
  /** The set was logged in a planned deload session. */
  isDeload?: boolean;
  exerciseId: string;
  exerciseName: string;
  exerciseType: ExerciseType;
  /** Weight is added load on top of bodyweight (dips, pull-ups, …). */
  isBodyweightPlus?: boolean;
  weightKg: number;
  reps: number;
};

/** Monday-00:00 local for the week containing `d` (matches the rest of the app). */
export function weekStartOf(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); // 0 = Monday … 6 = Sunday
  return date;
}

function addWeeks(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n * 7);
  return x;
}

/** Whole weeks between two Monday starts. */
function weeksBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

// ---------------------------------------------------------------------------
// Volume over time
// ---------------------------------------------------------------------------

export type WeeklyVolumePoint = {
  weekStart: Date;
  /** Σ(weight × reps) across every set that week. */
  volumeKg: number;
  compoundKg: number;
  isolationKg: number;
  /** The week contains at least one planned deload session. */
  hasDeload: boolean;
};

/** Total tonnage per calendar week (Monday start), oldest week first. */
export function weeklyVolume(rows: StatsRow[]): WeeklyVolumePoint[] {
  const byWeek = new Map<number, WeeklyVolumePoint>();
  for (const r of rows) {
    const weekStart = weekStartOf(r.performedAt);
    const key = weekStart.getTime();
    const vol = r.weightKg * r.reps;
    const acc = byWeek.get(key);
    if (acc) {
      acc.volumeKg += vol;
      if (r.exerciseType === "compound") acc.compoundKg += vol;
      else acc.isolationKg += vol;
      acc.hasDeload ||= r.isDeload ?? false;
    } else {
      byWeek.set(key, {
        weekStart,
        volumeKg: vol,
        compoundKg: r.exerciseType === "compound" ? vol : 0,
        isolationKg: r.exerciseType === "isolation" ? vol : 0,
        hasDeload: r.isDeload ?? false,
      });
    }
  }
  return Array.from(byWeek.values()).sort(
    (a, b) => a.weekStart.getTime() - b.weekStart.getTime()
  );
}

// ---------------------------------------------------------------------------
// Four-week deltas
// ---------------------------------------------------------------------------

export type FourWeekDeltas = {
  sessions: { current: number; previous: number };
  volumeKg: { current: number; previous: number };
  /**
   * Training exists before the current window, so "vs previous" is a real
   * comparison rather than an artifact of a program younger than 8 weeks.
   */
  hasPrior: boolean;
};

/**
 * Rolling 28-day windows ending today: sessions and tonnage in the last four
 * weeks vs the four weeks before that. Deltas answer "am I doing more or less
 * than before?" — the framing the headline tiles use.
 */
export function fourWeekDeltas(rows: StatsRow[], now = new Date()): FourWeekDeltas {
  const DAY = 24 * 60 * 60 * 1000;
  const end =
    new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() + DAY;
  const cutCurrent = end - 28 * DAY;
  const cutPrevious = end - 56 * DAY;

  const currentSessions = new Set<string>();
  const previousSessions = new Set<string>();
  let currentVolume = 0;
  let previousVolume = 0;
  let hasPrior = false;

  for (const r of rows) {
    const t = r.performedAt.getTime();
    if (t < cutCurrent) hasPrior = true;
    const vol = r.weightKg * r.reps;
    if (t >= cutCurrent && t < end) {
      currentSessions.add(r.sessionId);
      currentVolume += vol;
    } else if (t >= cutPrevious && t < cutCurrent) {
      previousSessions.add(r.sessionId);
      previousVolume += vol;
    }
  }

  return {
    sessions: { current: currentSessions.size, previous: previousSessions.size },
    volumeKg: { current: currentVolume, previous: previousVolume },
    hasPrior,
  };
}

// ---------------------------------------------------------------------------
// Daily session counts (consistency heatmap)
// ---------------------------------------------------------------------------

/**
 * Unique sessions per local calendar day, keyed by that day's midnight
 * timestamp — the heatmap's data.
 */
export function dailySessionCounts(rows: StatsRow[]): Map<number, number> {
  const seen = new Set<string>();
  const byDay = new Map<number, number>();
  for (const r of rows) {
    if (seen.has(r.sessionId)) continue;
    seen.add(r.sessionId);
    const d = r.performedAt;
    const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  return byDay;
}

// ---------------------------------------------------------------------------
// Consistency & streaks
// ---------------------------------------------------------------------------

export type ConsistencyStats = {
  totalSessions: number;
  thisWeek: number;
  weeklyCounts: { weekStart: Date; count: number }[];
  /** Consecutive weeks with ≥1 session, counting back from the current week. */
  currentWeekStreak: number;
  /** Sessions per week averaged over the tracked span (first session → now). */
  avgPerWeek: number;
};

export function consistency(rows: StatsRow[], now = new Date()): ConsistencyStats {
  // Collapse sets to unique sessions (first performedAt wins — they share one).
  const sessions = new Map<string, Date>();
  for (const r of rows) {
    if (!sessions.has(r.sessionId)) sessions.set(r.sessionId, r.performedAt);
  }
  const totalSessions = sessions.size;

  const byWeek = new Map<number, { weekStart: Date; count: number }>();
  for (const performedAt of sessions.values()) {
    const weekStart = weekStartOf(performedAt);
    const key = weekStart.getTime();
    const acc = byWeek.get(key);
    if (acc) acc.count += 1;
    else byWeek.set(key, { weekStart, count: 1 });
  }

  const thisWeekStart = weekStartOf(now);

  // Dense week series, first training week → current week (or the last logged
  // week if `now` predates it): skipped weeks appear as explicit zero counts so
  // the bar chart keeps a uniform time axis instead of silently omitting gaps.
  const weeklyCounts: { weekStart: Date; count: number }[] = [];
  if (byWeek.size > 0) {
    const sorted = Array.from(byWeek.values()).sort(
      (a, b) => a.weekStart.getTime() - b.weekStart.getTime()
    );
    const end = new Date(
      Math.max(thisWeekStart.getTime(), sorted[sorted.length - 1].weekStart.getTime())
    );
    for (let w = sorted[0].weekStart; w <= end; w = addWeeks(w, 1)) {
      weeklyCounts.push({ weekStart: w, count: byWeek.get(w.getTime())?.count ?? 0 });
    }
  }
  const thisWeek = byWeek.get(thisWeekStart.getTime())?.count ?? 0;

  // Streak: consecutive weeks with ≥1 session ending at the current week. An
  // empty current week doesn't break it — training mid-week hasn't happened yet —
  // so we start counting from last week in that case.
  let cursor = thisWeekStart;
  if (!byWeek.has(cursor.getTime())) cursor = addWeeks(cursor, -1);
  let currentWeekStreak = 0;
  while (byWeek.has(cursor.getTime())) {
    currentWeekStreak += 1;
    cursor = addWeeks(cursor, -1);
  }

  const spanWeeks = weeklyCounts.length
    ? weeksBetween(weeklyCounts[0].weekStart, thisWeekStart) + 1
    : 0;
  const avgPerWeek =
    spanWeeks > 0 ? Math.round((totalSessions / spanWeeks) * 10) / 10 : 0;

  return { totalSessions, thisWeek, weeklyCounts, currentWeekStreak, avgPerWeek };
}

// ---------------------------------------------------------------------------
// PR timeline
// ---------------------------------------------------------------------------

export type PrEvent = {
  performedAt: Date;
  exerciseName: string;
  weightKg: number;
  reps: number;
};

/** A session's top set for one exercise (heaviest; ties → more reps). */
type TopSet = {
  name: string;
  weightKg: number;
  reps: number;
  isBodyweightPlus: boolean;
};

/** Sessions oldest-first, each with its top set per exercise. */
function topSetsBySession(
  rows: StatsRow[]
): { performedAt: Date; best: Map<string, TopSet> }[] {
  const bySession = new Map<
    string,
    { performedAt: Date; best: Map<string, TopSet> }
  >();
  for (const r of rows) {
    let s = bySession.get(r.sessionId);
    if (!s) {
      s = { performedAt: r.performedAt, best: new Map() };
      bySession.set(r.sessionId, s);
    }
    const cur = s.best.get(r.exerciseId);
    if (
      !cur ||
      r.weightKg > cur.weightKg ||
      (r.weightKg === cur.weightKg && r.reps > cur.reps)
    ) {
      s.best.set(r.exerciseId, {
        name: r.exerciseName,
        weightKg: r.weightKg,
        reps: r.reps,
        isBodyweightPlus: r.isBodyweightPlus ?? false,
      });
    }
  }
  return Array.from(bySession.values()).sort(
    (a, b) => a.performedAt.getTime() - b.performedAt.getTime()
  );
}

/**
 * Chronological (oldest-first) log of weight PRs: each time a session's top set
 * for an exercise beats that exercise's best in any earlier session. The very
 * first time an exercise is logged is not a PR (mirrors getHomeLedger).
 */
export function prTimeline(rows: StatsRow[]): PrEvent[] {
  const bestPrior = new Map<string, number>();
  const events: PrEvent[] = [];
  for (const session of topSetsBySession(rows)) {
    for (const [exerciseId, top] of session.best) {
      const prior = bestPrior.get(exerciseId);
      if (prior != null && top.weightKg > prior) {
        events.push({
          performedAt: session.performedAt,
          exerciseName: top.name,
          weightKg: top.weightKg,
          reps: top.reps,
        });
      }
      if (prior == null || top.weightKg > prior) {
        bestPrior.set(exerciseId, top.weightKg);
      }
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// All-time best per exercise
// ---------------------------------------------------------------------------

export type ExerciseBest = {
  exerciseId: string;
  exerciseName: string;
  isBodyweightPlus: boolean;
  weightKg: number;
  reps: number;
  /** Date of the session in which this best was achieved. */
  performedAt: Date;
  /** Weight PRs along the way (same rule as prTimeline: first log ≠ PR). */
  prCount: number;
};

/**
 * One entry per exercise: its all-time best top set (heaviest; ties → more
 * reps) and when it happened. Freshest bests first — the deduplicated view the
 * stats page renders instead of the raw PR event stream.
 */
export function exerciseBests(rows: StatsRow[]): ExerciseBest[] {
  const best = new Map<string, ExerciseBest>();
  for (const session of topSetsBySession(rows)) {
    for (const [exerciseId, top] of session.best) {
      const cur = best.get(exerciseId);
      if (!cur) {
        best.set(exerciseId, {
          exerciseId,
          exerciseName: top.name,
          isBodyweightPlus: top.isBodyweightPlus,
          weightKg: top.weightKg,
          reps: top.reps,
          performedAt: session.performedAt,
          prCount: 0,
        });
      } else if (
        top.weightKg > cur.weightKg ||
        (top.weightKg === cur.weightKg && top.reps > cur.reps)
      ) {
        best.set(exerciseId, {
          ...cur,
          weightKg: top.weightKg,
          reps: top.reps,
          performedAt: session.performedAt,
          prCount: cur.prCount + (top.weightKg > cur.weightKg ? 1 : 0),
        });
      }
    }
  }
  return Array.from(best.values()).sort(
    (a, b) =>
      b.performedAt.getTime() - a.performedAt.getTime() ||
      a.exerciseName.localeCompare(b.exerciseName)
  );
}

// ---------------------------------------------------------------------------
// Estimated 1RM per exercise
// ---------------------------------------------------------------------------

export type E1rmSeries = {
  exerciseId: string;
  name: string;
  /** Total sets logged — used to surface the most-trained lift first. */
  setCount: number;
  points: { performedAt: Date; e1rm: number; isDeload: boolean }[];
};

/** Epley estimated one-rep-max for a single set. */
export function epley1Rm(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

/**
 * Per-exercise estimated-1RM series over time — one point per session, the best
 * e1rm across that session's sets (a lighter high-rep set can out-estimate the
 * heaviest single). Ordered most-trained exercise first, points oldest-first.
 */
export function estimated1RmByExercise(rows: StatsRow[]): E1rmSeries[] {
  type Ex = {
    name: string;
    setCount: number;
    bySession: Map<string, { performedAt: Date; e1rm: number; isDeload: boolean }>;
  };
  const byExercise = new Map<string, Ex>();

  for (const r of rows) {
    let ex = byExercise.get(r.exerciseId);
    if (!ex) {
      ex = { name: r.exerciseName, setCount: 0, bySession: new Map() };
      byExercise.set(r.exerciseId, ex);
    }
    ex.setCount += 1;
    const e1rm = epley1Rm(r.weightKg, r.reps);
    const cur = ex.bySession.get(r.sessionId);
    if (!cur)
      ex.bySession.set(r.sessionId, {
        performedAt: r.performedAt,
        e1rm,
        isDeload: r.isDeload ?? false,
      });
    else if (e1rm > cur.e1rm) cur.e1rm = e1rm;
  }

  return Array.from(byExercise.entries())
    .map(([exerciseId, ex]) => ({
      exerciseId,
      name: ex.name,
      setCount: ex.setCount,
      points: Array.from(ex.bySession.values())
        .sort((a, b) => a.performedAt.getTime() - b.performedAt.getTime())
        .map((p) => ({
          performedAt: p.performedAt,
          e1rm: Math.round(p.e1rm * 10) / 10,
          isDeload: p.isDeload,
        })),
    }))
    .sort((a, b) => b.setCount - a.setCount || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Stalled exercises (plateau scan)
// ---------------------------------------------------------------------------

export type StalledExercise = {
  exerciseId: string;
  exerciseName: string;
  /** The weight the exercise is stuck at. */
  weightKg: number;
  /** Consecutive non-deload sessions stuck there. */
  consecutive: number;
};

/**
 * Every exercise currently plateaued, most-stuck first: same top weight without
 * hitting the top of the rep range for ≥3 consecutive recent sessions
 * (deload sessions skipped — their planned lighter load isn't a stall).
 * Mirrors the per-exercise detail page's detectPlateau usage, but scans the
 * whole program so the stats page can surface stalls unprompted.
 */
export function stalledExercises(
  rows: StatsRow[],
  ranges: Map<string, RepRange>
): StalledExercise[] {
  type SessionAgg = {
    performedAt: Date;
    isDeload: boolean;
    totalSets: number;
    minReps: number;
    topWeightKg: number;
  };
  const byExercise = new Map<
    string,
    { name: string; sessions: Map<string, SessionAgg> }
  >();

  for (const r of rows) {
    let ex = byExercise.get(r.exerciseId);
    if (!ex) {
      ex = { name: r.exerciseName, sessions: new Map() };
      byExercise.set(r.exerciseId, ex);
    }
    const s = ex.sessions.get(r.sessionId);
    if (!s) {
      ex.sessions.set(r.sessionId, {
        performedAt: r.performedAt,
        isDeload: r.isDeload ?? false,
        totalSets: 1,
        minReps: r.reps,
        topWeightKg: r.weightKg,
      });
    } else {
      s.totalSets += 1;
      s.minReps = Math.min(s.minReps, r.reps);
      s.topWeightKg = Math.max(s.topWeightKg, r.weightKg);
    }
  }

  const out: StalledExercise[] = [];
  for (const [exerciseId, ex] of byExercise) {
    const rx = ranges.get(exerciseId);
    if (!rx) continue;
    // Most-recent-first, deloads excluded — same shape the exercise page feeds
    // detectPlateau (see getExerciseHistory + /exercises/[id]).
    const summaries = Array.from(ex.sessions.values())
      .sort((a, b) => b.performedAt.getTime() - a.performedAt.getTime())
      .filter((s) => !s.isDeload)
      .map((s) => ({
        weightKg: s.topWeightKg,
        hitTopOfRange: s.totalSets >= rx.targetSets && s.minReps >= rx.repMax,
      }));
    const p = detectPlateau(summaries);
    if (p.isPlateau && p.weightKg != null) {
      out.push({
        exerciseId,
        exerciseName: ex.name,
        weightKg: p.weightKg,
        consecutive: p.consecutive,
      });
    }
  }
  return out.sort(
    (a, b) =>
      b.consecutive - a.consecutive ||
      a.exerciseName.localeCompare(b.exerciseName)
  );
}
