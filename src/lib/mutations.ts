import { db } from "@/db";
import {
  programs,
  programDays,
  exercises,
  programDayExercises,
  workoutSessions,
  setLogs,
  sessionExerciseNotes,
  settings,
  bodyweightLogs,
  progressPhotos,
  type ExerciseType,
} from "@/db/schema";
import { and, asc, count, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { computeTrainingWeek, isDeloadWeek } from "@/lib/progression";

// --- Settings (key/value app state) ---

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  const existing = await getSetting(key);
  if (existing === null) {
    await db.insert(settings).values({ key, value });
  } else {
    await db.update(settings).set({ value }).where(eq(settings.key, key));
  }
}

// --- Sessions ---

/**
 * Start today's session for a day, or resume one already in progress today.
 * Records the training-week number, and seeds the training start date the very
 * first time a session is created (that's when week counting begins).
 */
export async function startOrResumeSession(dayId: string): Promise<string> {
  const [day] = await db
    .select()
    .from(programDays)
    .where(eq(programDays.id, dayId));
  if (!day) throw new Error(`Unknown program day: ${dayId}`);

  const now = new Date();

  let startIso = await getSetting("trainingStartDate");
  if (!startIso) {
    startIso = now.toISOString();
    await setSetting("trainingStartDate", startIso);
  }
  const weekNumber = computeTrainingWeek(new Date(startIso), now);

  // Resume an unfinished session for this day logged earlier today.
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const [existing] = await db
    .select()
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.dayId, dayId),
        isNull(workoutSessions.completedAt),
        gte(workoutSessions.performedAt, startOfToday),
        lt(workoutSessions.performedAt, startOfTomorrow)
      )
    )
    .orderBy(desc(workoutSessions.performedAt));
  if (existing) return existing.id;

  // Deload every 4th week, unless the athlete postponed this week's deload.
  const postponed = await getSetting("deloadPostponedWeek");
  const isDeload = isDeloadWeek(weekNumber) && postponed !== String(weekNumber);

  const id = nanoid();
  await db.insert(workoutSessions).values({
    id,
    programId: day.programId,
    dayId,
    performedAt: now,
    weekNumber,
    isDeload,
  });
  return id;
}

/** Skip the deload for the current training week (recorded against that week). */
export async function postponeDeload() {
  const startIso = await getSetting("trainingStartDate");
  if (!startIso) return;
  const week = computeTrainingWeek(new Date(startIso), new Date());
  await setSetting("deloadPostponedWeek", String(week));
}

export async function completeSession(sessionId: string) {
  await db
    .update(workoutSessions)
    .set({ completedAt: new Date() })
    .where(eq(workoutSessions.id, sessionId));
}

// --- Set logs ---

export type LogSetInput = {
  sessionId: string;
  exerciseId: string;
  weightKg: number;
  reps: number;
};

export async function logSet(input: LogSetInput) {
  const [{ c }] = await db
    .select({ c: count() })
    .from(setLogs)
    .where(
      and(
        eq(setLogs.sessionId, input.sessionId),
        eq(setLogs.exerciseId, input.exerciseId)
      )
    );
  const setNumber = Number(c) + 1;
  const id = nanoid();
  await db.insert(setLogs).values({
    id,
    sessionId: input.sessionId,
    exerciseId: input.exerciseId,
    setNumber,
    weightKg: input.weightKg,
    reps: input.reps,
  });
  return { id, setNumber, weightKg: input.weightKg, reps: input.reps };
}

export async function updateSet(
  id: string,
  values: { weightKg: number; reps: number }
) {
  await db.update(setLogs).set(values).where(eq(setLogs.id, id));
}

export async function deleteSet(id: string) {
  await db.delete(setLogs).where(eq(setLogs.id, id));
}

// --- Per-exercise notes ---

export type UpsertNoteInput = {
  sessionId: string;
  exerciseId: string;
  note: string;
};

export async function upsertExerciseNote({
  sessionId,
  exerciseId,
  note,
}: UpsertNoteInput) {
  const trimmed = note.trim();
  const [existing] = await db
    .select()
    .from(sessionExerciseNotes)
    .where(
      and(
        eq(sessionExerciseNotes.sessionId, sessionId),
        eq(sessionExerciseNotes.exerciseId, exerciseId)
      )
    );

  if (!trimmed) {
    if (existing) {
      await db
        .delete(sessionExerciseNotes)
        .where(eq(sessionExerciseNotes.id, existing.id));
    }
    return;
  }

  if (existing) {
    await db
      .update(sessionExerciseNotes)
      .set({ note: trimmed, updatedAt: new Date() })
      .where(eq(sessionExerciseNotes.id, existing.id));
  } else {
    await db.insert(sessionExerciseNotes).values({
      id: nanoid(),
      sessionId,
      exerciseId,
      note: trimmed,
    });
  }
}

// --- Program editor: prescriptions (which exercises a day contains) ---

export type PrescriptionInput = {
  dayId: string;
  exerciseId: string;
  targetSets: number;
  repMin: number;
  repMax: number;
};

export async function addExerciseToDay(input: PrescriptionInput) {
  const [{ c }] = await db
    .select({ c: count() })
    .from(programDayExercises)
    .where(eq(programDayExercises.dayId, input.dayId));
  const id = nanoid();
  await db.insert(programDayExercises).values({
    id,
    dayId: input.dayId,
    exerciseId: input.exerciseId,
    orderIndex: Number(c),
    targetSets: input.targetSets,
    repMin: input.repMin,
    repMax: input.repMax,
  });
  return id;
}

export async function updatePrescription(
  id: string,
  values: { targetSets: number; repMin: number; repMax: number }
) {
  await db
    .update(programDayExercises)
    .set(values)
    .where(eq(programDayExercises.id, id));
}

export async function removePrescription(id: string) {
  await db.delete(programDayExercises).where(eq(programDayExercises.id, id));
}

/** Swap a prescription's order with its neighbour within the same day. */
export async function reorderPrescription(id: string, direction: "up" | "down") {
  const [row] = await db
    .select()
    .from(programDayExercises)
    .where(eq(programDayExercises.id, id));
  if (!row) return;

  const siblings = await db
    .select()
    .from(programDayExercises)
    .where(eq(programDayExercises.dayId, row.dayId))
    .orderBy(asc(programDayExercises.orderIndex));

  const idx = siblings.findIndex((s) => s.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= siblings.length) return;

  const a = siblings[idx];
  const b = siblings[swapIdx];
  await db
    .update(programDayExercises)
    .set({ orderIndex: b.orderIndex })
    .where(eq(programDayExercises.id, a.id));
  await db
    .update(programDayExercises)
    .set({ orderIndex: a.orderIndex })
    .where(eq(programDayExercises.id, b.id));
}

// --- Program editor: training days ---

export async function addProgramDay(input: {
  programId: string;
  name: string;
  dayOfWeek: number;
}) {
  const [{ c }] = await db
    .select({ c: count() })
    .from(programDays)
    .where(eq(programDays.programId, input.programId));
  const id = nanoid();
  await db.insert(programDays).values({
    id,
    programId: input.programId,
    name: input.name.trim() || "New day",
    dayOfWeek: input.dayOfWeek,
    orderIndex: Number(c),
  });
  return id;
}

export async function renameDay(id: string, name: string) {
  await db
    .update(programDays)
    .set({ name: name.trim() || "Untitled day" })
    .where(eq(programDays.id, id));
}

export async function setDayOfWeek(id: string, dayOfWeek: number) {
  await db.update(programDays).set({ dayOfWeek }).where(eq(programDays.id, id));
}

/** Removing a day cascades to its prescriptions (FK onDelete: cascade). */
export async function removeDay(id: string) {
  await db.delete(programDays).where(eq(programDays.id, id));
}

// --- Program editor: exercise library ---

export async function createExercise(input: {
  name: string;
  type: ExerciseType;
  defaultRestSeconds: number;
  injuryNote?: string | null;
}) {
  const id = nanoid();
  await db.insert(exercises).values({
    id,
    name: input.name.trim(),
    type: input.type,
    defaultRestSeconds: input.defaultRestSeconds,
    injuryNote: input.injuryNote?.trim() || null,
  });
  return id;
}

export async function updateExercise(
  id: string,
  values: {
    name?: string;
    type?: ExerciseType;
    defaultRestSeconds?: number;
    injuryNote?: string | null;
  }
) {
  const patch: Partial<typeof exercises.$inferInsert> = { updatedAt: new Date() };
  if (values.name !== undefined) patch.name = values.name.trim();
  if (values.type !== undefined) patch.type = values.type;
  if (values.defaultRestSeconds !== undefined)
    patch.defaultRestSeconds = values.defaultRestSeconds;
  if (values.injuryNote !== undefined)
    patch.injuryNote = values.injuryNote?.trim() || null;
  await db.update(exercises).set(patch).where(eq(exercises.id, id));
}

// --- Program editor: programs ---

/** Create a new (inactive) program — activate it separately with setActiveProgram. */
export async function createProgram(name: string) {
  const id = nanoid();
  await db
    .insert(programs)
    .values({ id, name: name.trim() || "New program", isActive: false });
  return id;
}

export async function renameProgram(id: string, name: string) {
  await db
    .update(programs)
    .set({ name: name.trim() || "Untitled program", updatedAt: new Date() })
    .where(eq(programs.id, id));
}

export async function archiveProgram(id: string) {
  await db
    .update(programs)
    .set({ isActive: false, archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(programs.id, id));
}

export async function restoreProgram(id: string) {
  await db
    .update(programs)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(programs.id, id));
}

/** Make one program the single active program (deactivates and un-archives it). */
export async function setActiveProgram(id: string) {
  await db.update(programs).set({ isActive: false });
  await db
    .update(programs)
    .set({ isActive: true, archivedAt: null, updatedAt: new Date() })
    .where(eq(programs.id, id));
}

// --- Bodyweight ---

export async function logBodyweight(input: {
  weightKg: number;
  measuredAt?: Date;
}) {
  const id = nanoid();
  await db.insert(bodyweightLogs).values({
    id,
    weightKg: input.weightKg,
    ...(input.measuredAt ? { measuredAt: input.measuredAt } : {}),
  });
  return id;
}

export async function deleteBodyweight(id: string) {
  await db.delete(bodyweightLogs).where(eq(bodyweightLogs.id, id));
}

// --- Coach provider settings (saved in the key/value settings table) ---

export async function saveCoachSettings(input: {
  provider: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}) {
  await setSetting("coachProvider", input.provider.trim());
  await setSetting("coachModel", input.model?.trim() ?? "");
  await setSetting("coachBaseUrl", input.baseUrl?.trim() ?? "");
  // Only overwrite the saved key when a new one is supplied (blank = keep existing).
  if (input.apiKey && input.apiKey.trim()) {
    await setSetting("coachApiKey", input.apiKey.trim());
  }
}

/** Disconnect: clear all DB coach settings so resolution falls back to env. */
export async function clearCoachSettings() {
  await setSetting("coachProvider", "");
  await setSetting("coachModel", "");
  await setSetting("coachBaseUrl", "");
  await setSetting("coachApiKey", "");
}

// --- Progress photos (metadata; bytes are written to disk separately) ---

export async function createProgressPhoto(input: {
  id: string;
  mimeType: string;
  takenAt?: Date;
  note?: string | null;
}) {
  await db.insert(progressPhotos).values({
    id: input.id,
    mimeType: input.mimeType,
    note: input.note?.trim() || null,
    ...(input.takenAt ? { takenAt: input.takenAt } : {}),
  });
}

export async function deleteProgressPhoto(id: string) {
  await db.delete(progressPhotos).where(eq(progressPhotos.id, id));
}
