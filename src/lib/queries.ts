import { db } from "@/db";
import {
  programs,
  programDays,
  exercises,
  programDayExercises,
  workoutSessions,
  setLogs,
  sessionExerciseNotes,
  bodyweightLogs,
  progressPhotos,
  type ExerciseType,
} from "@/db/schema";
import { and, asc, count, desc, eq, gte, isNotNull, lt, ne } from "drizzle-orm";
import { computeTrainingWeek, isDeloadWeek } from "@/lib/progression";
import { getSetting } from "@/lib/mutations";
import type {
  CoachingSnapshot,
  ExerciseSnapshot,
  SnapshotSession,
} from "@/lib/coach";

/** ISO weekday for a date: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date = new Date()): number {
  return ((date.getDay() + 6) % 7) + 1;
}

export async function getActiveProgram() {
  const [program] = await db
    .select()
    .from(programs)
    .where(eq(programs.isActive, true))
    .orderBy(desc(programs.createdAt));
  return program ?? null;
}

export async function getProgramDays(programId: string) {
  return db
    .select()
    .from(programDays)
    .where(eq(programDays.programId, programId))
    .orderBy(asc(programDays.orderIndex));
}

/** The training day scheduled for `weekday` (default today), or null on rest days. */
export async function getDayForWeekday(programId: string, weekday = isoWeekday()) {
  const [day] = await db
    .select()
    .from(programDays)
    .where(
      and(eq(programDays.programId, programId), eq(programDays.dayOfWeek, weekday))
    );
  return day ?? null;
}

/** Map of dayId -> number of prescribed exercises, for the home overview. */
export async function getProgramDayCounts(
  programId: string
): Promise<Map<string, number>> {
  const rows = await db
    .select({ dayId: programDayExercises.dayId, c: count() })
    .from(programDayExercises)
    .innerJoin(programDays, eq(programDayExercises.dayId, programDays.id))
    .where(eq(programDays.programId, programId))
    .groupBy(programDayExercises.dayId);
  return new Map(rows.map((r) => [r.dayId, Number(r.c)]));
}

export type DayExercise = {
  prescriptionId: string;
  exerciseId: string;
  name: string;
  type: ExerciseType;
  injuryNote: string | null;
  defaultRestSeconds: number;
  orderIndex: number;
  targetSets: number;
  repMin: number;
  repMax: number;
};

export async function getDayExercises(dayId: string): Promise<DayExercise[]> {
  return db
    .select({
      prescriptionId: programDayExercises.id,
      exerciseId: exercises.id,
      name: exercises.name,
      type: exercises.type,
      injuryNote: exercises.injuryNote,
      defaultRestSeconds: exercises.defaultRestSeconds,
      orderIndex: programDayExercises.orderIndex,
      targetSets: programDayExercises.targetSets,
      repMin: programDayExercises.repMin,
      repMax: programDayExercises.repMax,
    })
    .from(programDayExercises)
    .innerJoin(exercises, eq(programDayExercises.exerciseId, exercises.id))
    .where(eq(programDayExercises.dayId, dayId))
    .orderBy(asc(programDayExercises.orderIndex));
}

export type LoggedSetRow = {
  id: string;
  setNumber: number;
  weightKg: number;
  reps: number;
};

/**
 * The sets from the most recent OTHER session that included this exercise —
 * i.e. "what you did last time", shown when you open the exercise.
 */
export async function getLastSessionSetsForExercise(
  exerciseId: string,
  currentSessionId: string
): Promise<{ performedAt: Date; sets: LoggedSetRow[] } | null> {
  const rows = await db
    .select({
      id: setLogs.id,
      setNumber: setLogs.setNumber,
      weightKg: setLogs.weightKg,
      reps: setLogs.reps,
      sessionId: setLogs.sessionId,
      performedAt: workoutSessions.performedAt,
    })
    .from(setLogs)
    .innerJoin(workoutSessions, eq(setLogs.sessionId, workoutSessions.id))
    .where(
      and(eq(setLogs.exerciseId, exerciseId), ne(setLogs.sessionId, currentSessionId))
    )
    .orderBy(desc(workoutSessions.performedAt), asc(setLogs.setNumber));

  if (rows.length === 0) return null;

  // Keep only the sets belonging to the most recent prior session.
  const latestSessionId = rows[0].sessionId;
  const sets = rows
    .filter((r) => r.sessionId === latestSessionId)
    .map(({ id, setNumber, weightKg, reps }) => ({ id, setNumber, weightKg, reps }));

  return { performedAt: rows[0].performedAt, sets };
}

export type SessionExerciseView = DayExercise & {
  loggedSets: LoggedSetRow[];
  note: string | null;
  lastSession: { performedAt: Date; sets: LoggedSetRow[] } | null;
};

export type SessionView = {
  session: {
    id: string;
    dayId: string;
    programId: string;
    performedAt: Date;
    completedAt: Date | null;
    weekNumber: number;
    isDeload: boolean;
  };
  dayName: string;
  programName: string;
  exercises: SessionExerciseView[];
};

export async function getSessionView(sessionId: string): Promise<SessionView | null> {
  const [session] = await db
    .select({
      id: workoutSessions.id,
      dayId: workoutSessions.dayId,
      programId: workoutSessions.programId,
      performedAt: workoutSessions.performedAt,
      completedAt: workoutSessions.completedAt,
      weekNumber: workoutSessions.weekNumber,
      isDeload: workoutSessions.isDeload,
      dayName: programDays.name,
      programName: programs.name,
    })
    .from(workoutSessions)
    .innerJoin(programDays, eq(workoutSessions.dayId, programDays.id))
    .innerJoin(programs, eq(workoutSessions.programId, programs.id))
    .where(eq(workoutSessions.id, sessionId));

  if (!session) return null;

  const [prescriptions, logs, notes] = await Promise.all([
    getDayExercises(session.dayId),
    db
      .select()
      .from(setLogs)
      .where(eq(setLogs.sessionId, sessionId))
      .orderBy(asc(setLogs.setNumber)),
    db
      .select()
      .from(sessionExerciseNotes)
      .where(eq(sessionExerciseNotes.sessionId, sessionId)),
  ]);

  const exerciseViews = await Promise.all(
    prescriptions.map(async (rx): Promise<SessionExerciseView> => {
      const loggedSets = logs
        .filter((l) => l.exerciseId === rx.exerciseId)
        .map(({ id, setNumber, weightKg, reps }) => ({
          id,
          setNumber,
          weightKg,
          reps,
        }));
      const noteRow = notes.find((n) => n.exerciseId === rx.exerciseId);
      const lastSession = await getLastSessionSetsForExercise(
        rx.exerciseId,
        sessionId
      );
      return { ...rx, loggedSets, note: noteRow?.note ?? null, lastSession };
    })
  );

  return {
    session: {
      id: session.id,
      dayId: session.dayId,
      programId: session.programId,
      performedAt: session.performedAt,
      completedAt: session.completedAt,
      weekNumber: session.weekNumber,
      isDeload: session.isDeload,
    },
    dayName: session.dayName,
    programName: session.programName,
    exercises: exerciseViews,
  };
}

export type ExerciseHistoryPoint = {
  sessionId: string;
  performedAt: Date;
  topWeightKg: number;
  topReps: number;
  totalSets: number;
  /** Whether every working set reached the top of the rep range that session. */
  hitTopOfRange: boolean;
};

export async function getExerciseHistory(exerciseId: string) {
  const [exercise] = await db
    .select()
    .from(exercises)
    .where(eq(exercises.id, exerciseId));
  if (!exercise) return null;

  // Target rep range, taken from any day that prescribes this exercise.
  const [rx] = await db
    .select({
      targetSets: programDayExercises.targetSets,
      repMin: programDayExercises.repMin,
      repMax: programDayExercises.repMax,
    })
    .from(programDayExercises)
    .where(eq(programDayExercises.exerciseId, exerciseId))
    .limit(1);

  const rows = await db
    .select({
      sessionId: setLogs.sessionId,
      performedAt: workoutSessions.performedAt,
      weightKg: setLogs.weightKg,
      reps: setLogs.reps,
    })
    .from(setLogs)
    .innerJoin(workoutSessions, eq(setLogs.sessionId, workoutSessions.id))
    .where(eq(setLogs.exerciseId, exerciseId))
    .orderBy(asc(workoutSessions.performedAt));

  // Condense per session: the top set (for the graph) plus the lowest rep count
  // (to decide whether every set hit the top of the range, like allSetsHitTop).
  type Acc = {
    sessionId: string;
    performedAt: Date;
    topWeightKg: number;
    topReps: number;
    totalSets: number;
    minReps: number;
  };
  const bySession = new Map<string, Acc>();
  for (const r of rows) {
    const existing = bySession.get(r.sessionId);
    if (!existing) {
      bySession.set(r.sessionId, {
        sessionId: r.sessionId,
        performedAt: r.performedAt,
        topWeightKg: r.weightKg,
        topReps: r.reps,
        totalSets: 1,
        minReps: r.reps,
      });
    } else {
      existing.totalSets += 1;
      existing.minReps = Math.min(existing.minReps, r.reps);
      if (r.weightKg > existing.topWeightKg) {
        existing.topWeightKg = r.weightKg;
        existing.topReps = r.reps;
      }
    }
  }

  const points: ExerciseHistoryPoint[] = Array.from(bySession.values()).map(
    (a) => ({
      sessionId: a.sessionId,
      performedAt: a.performedAt,
      topWeightKg: a.topWeightKg,
      topReps: a.topReps,
      totalSets: a.totalSets,
      hitTopOfRange: rx
        ? a.totalSets >= rx.targetSets && a.minReps >= rx.repMax
        : false,
    })
  );

  return { exercise, targetRange: rx ?? null, points };
}

/**
 * Assemble everything the AI coach needs from the active program: the training
 * week + deload state, and each prescribed exercise with its recent sessions
 * (most-recent-first), scoped to this program. Returns null when no program is
 * active. The route handler turns this into a brief via `buildCoachingBrief`.
 */
export async function getCoachingInput(): Promise<CoachingSnapshot | null> {
  const program = await getActiveProgram();
  if (!program) return null;

  // Same week/deload inputs the home page uses.
  const startIso = await getSetting("trainingStartDate");
  const weekNumber = startIso
    ? computeTrainingWeek(new Date(startIso), new Date())
    : 1;

  // Distinct exercises prescribed anywhere in this program, each with a
  // representative rep range (an exercise can appear on several days — take its
  // first listing, in program order).
  const prescriptions = await db
    .select({
      exerciseId: exercises.id,
      name: exercises.name,
      type: exercises.type,
      injuryNote: exercises.injuryNote,
      targetSets: programDayExercises.targetSets,
      repMin: programDayExercises.repMin,
      repMax: programDayExercises.repMax,
    })
    .from(programDayExercises)
    .innerJoin(programDays, eq(programDayExercises.dayId, programDays.id))
    .innerJoin(exercises, eq(programDayExercises.exerciseId, exercises.id))
    .where(eq(programDays.programId, program.id))
    .orderBy(asc(programDays.orderIndex), asc(programDayExercises.orderIndex));

  const byExercise = new Map<string, (typeof prescriptions)[number]>();
  for (const p of prescriptions) {
    if (!byExercise.has(p.exerciseId)) byExercise.set(p.exerciseId, p);
  }

  // Every logged set in this program, newest session first. One pass groups
  // rows into per-exercise, per-session buckets while preserving that order.
  const logRows = await db
    .select({
      exerciseId: setLogs.exerciseId,
      sessionId: setLogs.sessionId,
      performedAt: workoutSessions.performedAt,
      weightKg: setLogs.weightKg,
      reps: setLogs.reps,
    })
    .from(setLogs)
    .innerJoin(workoutSessions, eq(setLogs.sessionId, workoutSessions.id))
    .where(eq(workoutSessions.programId, program.id))
    .orderBy(desc(workoutSessions.performedAt), asc(setLogs.setNumber));

  const sessionsByExercise = new Map<string, SnapshotSession[]>();
  const sessionLookup = new Map<string, Map<string, SnapshotSession>>();
  for (const r of logRows) {
    let perEx = sessionLookup.get(r.exerciseId);
    if (!perEx) {
      perEx = new Map();
      sessionLookup.set(r.exerciseId, perEx);
      sessionsByExercise.set(r.exerciseId, []);
    }
    let session = perEx.get(r.sessionId);
    if (!session) {
      session = { performedAt: r.performedAt, sets: [] };
      perEx.set(r.sessionId, session);
      sessionsByExercise.get(r.exerciseId)!.push(session);
    }
    session.sets.push({ weightKg: r.weightKg, reps: r.reps });
  }

  const exerciseSnapshots: ExerciseSnapshot[] = Array.from(
    byExercise,
    ([exerciseId, p]): ExerciseSnapshot => ({
      name: p.name,
      type: p.type,
      injuryNote: p.injuryNote,
      rx: { targetSets: p.targetSets, repMin: p.repMin, repMax: p.repMax },
      sessions: sessionsByExercise.get(exerciseId) ?? [],
    })
  );

  return {
    programName: program.name,
    weekNumber,
    isDeload: isDeloadWeek(weekNumber),
    exercises: exerciseSnapshots,
  };
}

/** The whole exercise library, alphabetised — for the editor's exercise picker. */
export async function getExerciseLibrary() {
  return db.select().from(exercises).orderBy(asc(exercises.name));
}

/** All programs (active first, then newest), for the program switcher. */
export async function getAllPrograms() {
  return db
    .select()
    .from(programs)
    .orderBy(desc(programs.isActive), desc(programs.createdAt));
}

/** Every bodyweight weigh-in, oldest first (for the weekly-average chart). */
export async function getBodyweightEntries() {
  return db
    .select()
    .from(bodyweightLogs)
    .orderBy(asc(bodyweightLogs.measuredAt));
}

/** Progress photos, newest first (for the gallery). */
export async function getProgressPhotos() {
  return db
    .select()
    .from(progressPhotos)
    .orderBy(desc(progressPhotos.takenAt));
}

// --- Home "ledger" + week rail (Ember redesign) ---------------------------

export type HomeLedger = {
  dayName: string;
  /** ISO weekday of the session (1 = Monday … 7 = Sunday). */
  weekday: number;
  performedAt: Date;
  /** Total weight moved, in kg (Σ weight × reps). */
  volumeKg: number;
  /** Wall-clock minutes from start to completion, or null if not finished. */
  durationMin: number | null;
  /** Exercises whose best set beat their previous best — a PR. */
  prCount: number;
};

/**
 * The most recently completed session, condensed to the ledger card's three
 * headline stats. PRs are detected per exercise: a session's best set weight
 * beating that exercise's best in any earlier session (mirrors the receipt).
 * Returns null when no session has been completed yet.
 */
export async function getHomeLedger(programId: string): Promise<HomeLedger | null> {
  const [session] = await db
    .select({
      id: workoutSessions.id,
      performedAt: workoutSessions.performedAt,
      completedAt: workoutSessions.completedAt,
      dayName: programDays.name,
      weekday: programDays.dayOfWeek,
    })
    .from(workoutSessions)
    .innerJoin(programDays, eq(workoutSessions.dayId, programDays.id))
    .where(
      and(
        eq(workoutSessions.programId, programId),
        isNotNull(workoutSessions.completedAt)
      )
    )
    .orderBy(desc(workoutSessions.performedAt))
    .limit(1);

  if (!session) return null;

  const logs = await db
    .select({ exerciseId: setLogs.exerciseId, weightKg: setLogs.weightKg, reps: setLogs.reps })
    .from(setLogs)
    .where(eq(setLogs.sessionId, session.id));

  const volumeKg = logs.reduce((sum, l) => sum + l.weightKg * l.reps, 0);
  // Wall-clock duration; sessions resumed hours/days later would show absurd
  // numbers, so anything past 4h reads as "no meaningful duration".
  const rawMin = session.completedAt
    ? Math.max(
        1,
        Math.round(
          (session.completedAt.getTime() - session.performedAt.getTime()) / 60000
        )
      )
    : null;
  const durationMin = rawMin != null && rawMin <= 240 ? rawMin : null;

  // Best weight per exercise in this session.
  const bestNow = new Map<string, number>();
  for (const l of logs) {
    bestNow.set(l.exerciseId, Math.max(bestNow.get(l.exerciseId) ?? 0, l.weightKg));
  }

  // Best weight per exercise across every earlier session in this program.
  let prCount = 0;
  if (bestNow.size > 0) {
    const priorRows = await db
      .select({ exerciseId: setLogs.exerciseId, weightKg: setLogs.weightKg })
      .from(setLogs)
      .innerJoin(workoutSessions, eq(setLogs.sessionId, workoutSessions.id))
      .where(
        and(
          eq(workoutSessions.programId, programId),
          lt(workoutSessions.performedAt, session.performedAt)
        )
      );

    const bestPrior = new Map<string, number>();
    for (const r of priorRows) {
      bestPrior.set(
        r.exerciseId,
        Math.max(bestPrior.get(r.exerciseId) ?? 0, r.weightKg)
      );
    }

    for (const [exerciseId, now] of bestNow) {
      const prior = bestPrior.get(exerciseId);
      if (prior != null && now > prior) prCount += 1;
    }
  }

  return {
    dayName: session.dayName,
    weekday: session.weekday,
    performedAt: session.performedAt,
    volumeKg,
    durationMin,
    prCount,
  };
}

/** Monday-00:00 (local) of the calendar week containing `d`. */
function startOfWeek(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

/**
 * Program-day ids that already have a completed session in the current calendar
 * week — drives the week rail's "DONE" marks and the home "FORGED TODAY" state.
 */
export async function getCompletedDayIdsThisWeek(
  programId: string
): Promise<Set<string>> {
  const rows = await db
    .select({ dayId: workoutSessions.dayId })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.programId, programId),
        isNotNull(workoutSessions.completedAt),
        gte(workoutSessions.performedAt, startOfWeek(new Date()))
      )
    );
  return new Set(rows.map((r) => r.dayId));
}

/** One photo's metadata — for serving its bytes with the right content type. */
export async function getPhoto(id: string) {
  const [photo] = await db
    .select()
    .from(progressPhotos)
    .where(eq(progressPhotos.id, id));
  return photo ?? null;
}
