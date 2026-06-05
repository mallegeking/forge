"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AUTH_COOKIE, checkPasscode, sessionToken } from "@/lib/auth";
import {
  startOrResumeSession,
  completeSession,
  postponeDeload,
  logSet,
  updateSet,
  deleteSet,
  upsertExerciseNote,
  addExerciseToDay,
  updatePrescription,
  removePrescription,
  reorderPrescription,
  addProgramDay,
  renameDay,
  setDayOfWeek,
  removeDay,
  createExercise,
  updateExercise,
  createProgram,
  renameProgram,
  archiveProgram,
  restoreProgram,
  setActiveProgram,
} from "@/lib/mutations";
import type { ExerciseType } from "@/db/schema";

// --- Auth ---

export async function loginAction(formData: FormData) {
  const passcode = String(formData.get("passcode") ?? "");

  if (!checkPasscode(passcode)) {
    redirect("/login?error=1");
  }

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  redirect("/");
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE);
  redirect("/login");
}

// --- Training sessions ---

export async function startSessionAction(formData: FormData) {
  const dayId = String(formData.get("dayId") ?? "");
  const sessionId = await startOrResumeSession(dayId);
  redirect(`/session/${sessionId}`);
}

export async function finishSessionAction(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  await completeSession(sessionId);
  revalidatePath("/");
  redirect("/");
}

export async function postponeDeloadAction() {
  await postponeDeload();
  revalidatePath("/");
}

// Called from client components with structured args.

export async function logSetAction(input: {
  sessionId: string;
  exerciseId: string;
  weightKg: number;
  reps: number;
}) {
  const set = await logSet(input);
  revalidatePath(`/session/${input.sessionId}`);
  return set;
}

export async function updateSetAction(input: {
  id: string;
  sessionId: string;
  weightKg: number;
  reps: number;
}) {
  await updateSet(input.id, { weightKg: input.weightKg, reps: input.reps });
  revalidatePath(`/session/${input.sessionId}`);
}

export async function deleteSetAction(input: { id: string; sessionId: string }) {
  await deleteSet(input.id);
  revalidatePath(`/session/${input.sessionId}`);
}

export async function saveNoteAction(input: {
  sessionId: string;
  exerciseId: string;
  note: string;
}) {
  await upsertExerciseNote(input);
  revalidatePath(`/session/${input.sessionId}`);
}

// --- Program editor ---
// Structural edits affect both the program page and the home overview, so both
// are revalidated. Called from client components with structured args.

function revalidateProgram() {
  revalidatePath("/program");
  revalidatePath("/");
}

export async function addExerciseToDayAction(input: {
  dayId: string;
  exerciseId: string;
  targetSets: number;
  repMin: number;
  repMax: number;
}) {
  await addExerciseToDay(input);
  revalidateProgram();
}

export async function updatePrescriptionAction(input: {
  id: string;
  targetSets: number;
  repMin: number;
  repMax: number;
}) {
  await updatePrescription(input.id, {
    targetSets: input.targetSets,
    repMin: input.repMin,
    repMax: input.repMax,
  });
  revalidateProgram();
}

export async function removePrescriptionAction(input: { id: string }) {
  await removePrescription(input.id);
  revalidateProgram();
}

export async function reorderPrescriptionAction(input: {
  id: string;
  direction: "up" | "down";
}) {
  await reorderPrescription(input.id, input.direction);
  revalidateProgram();
}

export async function addProgramDayAction(input: {
  programId: string;
  name: string;
  dayOfWeek: number;
}) {
  await addProgramDay(input);
  revalidateProgram();
}

export async function renameDayAction(input: { id: string; name: string }) {
  await renameDay(input.id, input.name);
  revalidateProgram();
}

export async function setDayOfWeekAction(input: { id: string; dayOfWeek: number }) {
  await setDayOfWeek(input.id, input.dayOfWeek);
  revalidateProgram();
}

export async function removeDayAction(input: { id: string }) {
  await removeDay(input.id);
  revalidateProgram();
}

export async function createExerciseAction(input: {
  name: string;
  type: ExerciseType;
  defaultRestSeconds: number;
  injuryNote?: string | null;
}) {
  const id = await createExercise(input);
  revalidateProgram();
  return id;
}

export async function updateExerciseAction(input: {
  id: string;
  name?: string;
  type?: ExerciseType;
  defaultRestSeconds?: number;
  injuryNote?: string | null;
}) {
  const { id, ...values } = input;
  await updateExercise(id, values);
  revalidateProgram();
}

export async function createProgramAction(input: { name: string }) {
  const id = await createProgram(input.name);
  revalidateProgram();
  return id;
}

export async function renameProgramAction(input: { id: string; name: string }) {
  await renameProgram(input.id, input.name);
  revalidateProgram();
}

export async function archiveProgramAction(input: { id: string }) {
  await archiveProgram(input.id);
  revalidateProgram();
}

export async function restoreProgramAction(input: { id: string }) {
  await restoreProgram(input.id);
  revalidateProgram();
}

export async function setActiveProgramAction(input: { id: string }) {
  await setActiveProgram(input.id);
  revalidateProgram();
}
