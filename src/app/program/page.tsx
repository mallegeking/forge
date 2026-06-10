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
import { getDict } from "@/lib/i18n/server";

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

  return (
    <div>
      <header className="mb-4 flex items-center gap-2">
        <Link
          href="/"
          aria-label={t.common.back}
          className="-ml-2 flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {program.name}
          </h1>
          <p className="text-xs text-muted-foreground">
            {days.length}
            {t.program.daySplit}
          </p>
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
