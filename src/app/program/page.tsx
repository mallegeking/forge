import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import {
  getActiveProgram,
  getProgramDays,
  getDayExercises,
  getExerciseLibrary,
  getAllPrograms,
} from "@/lib/queries";
import { ProgramEditor, type DayBlock } from "@/components/program/program-editor";

// Reads the database directly — render per request, not prerendered at build.
export const dynamic = "force-dynamic";

export default async function ProgramPage() {
  const program = await getActiveProgram();
  if (!program) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">
        No active program.
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

  return (
    <div>
      <header className="mb-4 flex items-center gap-2">
        <Link
          href="/"
          aria-label="Back"
          className="-ml-2 flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {program.name}
          </h1>
          <p className="text-xs text-muted-foreground">{days.length}-day split</p>
        </div>
      </header>

      <ProgramEditor
        program={program}
        programs={programs}
        days={days}
        library={library}
      />
    </div>
  );
}
