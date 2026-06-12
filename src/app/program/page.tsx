import type { Metadata } from "next";
import {
  getActiveProgram,
  getProgramDays,
  getDayExercises,
  getExerciseLibrary,
  getAllPrograms,
} from "@/lib/queries";
import { ProgramEditor, type DayBlock } from "@/components/program/program-editor";
import { getDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Program · Forge" };

// Reads the database directly — render per request, not prerendered at build.
export const dynamic = "force-dynamic";

export default async function ProgramPage() {
  const [program, t] = await Promise.all([getActiveProgram(), getDict()]);
  if (!program) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">
        {t.program.noActive}
      </p>
    );
  }

  const [daysRaw, library, programs] = await Promise.all([
    getProgramDays(program.id),
    getExerciseLibrary(),
    getAllPrograms(),
  ]);
  const days: DayBlock[] = await Promise.all(
    daysRaw.map(async (day) => ({
      day,
      exercises: await getDayExercises(day.id),
    }))
  );

  // The header (incl. the EDIT pill) lives inside the editor so the toggle
  // can flip the whole screen between view and edit modes.
  return <ProgramEditor program={program} programs={programs} days={days} library={library} />;
}
