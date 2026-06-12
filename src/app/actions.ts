"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AUTH_COOKIE, checkPasscode, sessionToken } from "@/lib/auth";
import {
  startOrResumeSession,
  completeSession,
  postponeDeload,
  resetTrainingProgress,
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
  logBodyweight,
  deleteBodyweight,
  saveCoachSettings,
  clearCoachSettings,
  saveNutritionConfig,
  deleteProgressPhoto,
} from "@/lib/mutations";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";
import { getCoachProvider } from "@/lib/coach-config";
import { streamCoach } from "@/lib/coach-stream";
import { deletePhotoFile } from "@/lib/photo-storage";
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

// --- Locale ---

export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  // The locale shapes every rendered page, so refresh the whole tree.
  revalidatePath("/", "layout");
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

/**
 * Mark a session complete WITHOUT redirecting — the Ember session flow shows
 * its "Forged" receipt client-side first, then navigates home from the receipt.
 */
export async function completeSessionAction(input: { sessionId: string }) {
  await completeSession(input.sessionId);
  revalidatePath("/");
}

export async function postponeDeloadAction() {
  await postponeDeload();
  revalidatePath("/");
}

export async function resetTrainingProgressAction() {
  await resetTrainingProgress();
  revalidatePath("/");
  revalidatePath("/settings");
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
  isBodyweightPlus?: boolean;
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
  isBodyweightPlus?: boolean;
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

// --- Bodyweight ---

export async function logBodyweightAction(input: {
  weightKg: number;
  measuredAt?: string;
}) {
  await logBodyweight({
    weightKg: input.weightKg,
    measuredAt: input.measuredAt ? new Date(input.measuredAt) : undefined,
  });
  revalidatePath("/bodyweight");
}

export async function deleteBodyweightAction(input: { id: string }) {
  await deleteBodyweight(input.id);
  revalidatePath("/bodyweight");
}

// --- Coach provider settings ---

export async function saveCoachSettingsAction(input: {
  provider: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}) {
  await saveCoachSettings(input);
  revalidatePath("/settings");
  revalidatePath("/coach");
}

export async function disconnectCoachAction() {
  await clearCoachSettings();
  revalidatePath("/settings");
  revalidatePath("/coach");
}

// --- Nutrition ---

export async function saveNutritionAction(input: {
  activity: string;
  goal: string;
  calorieOverride?: string | null;
  proteinOverride?: string | null;
  preferences?: string | null;
}) {
  await saveNutritionConfig(input);
  revalidatePath("/nutrition");
}

// --- Progress photos ---

export async function deletePhotoAction(input: { id: string }) {
  await deleteProgressPhoto(input.id);
  await deletePhotoFile(input.id);
  revalidatePath("/photos");
}

/** Live check of the currently-saved provider — used by the Settings "Test" button. */
export async function testCoachAction(): Promise<{ ok: boolean; message: string }> {
  const provider = await getCoachProvider();
  if (!provider) return { ok: false, message: "No provider configured yet." };
  const name = provider.kind === "anthropic" ? "anthropic" : provider.provider;
  try {
    let out = "";
    for await (const chunk of streamCoach(
      provider,
      "You are a connection test.",
      [{ role: "user", content: "Reply with exactly: ok" }]
    )) {
      out += chunk;
      if (out.length > 30) break;
    }
    return { ok: true, message: `Connected to ${name} (${provider.model}).` };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message.slice(0, 200) : "Request failed.",
    };
  }
}
