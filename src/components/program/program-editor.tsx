"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Check,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { weekdayName } from "@/lib/format";
import { ExercisePicker } from "@/components/program/exercise-picker";
import type { DayExercise } from "@/lib/queries";
import type { Program, ProgramDay, Exercise } from "@/db/schema";
import {
  updatePrescriptionAction,
  removePrescriptionAction,
  reorderPrescriptionAction,
  addProgramDayAction,
  renameDayAction,
  setDayOfWeekAction,
  removeDayAction,
  renameProgramAction,
  createProgramAction,
  archiveProgramAction,
  restoreProgramAction,
  setActiveProgramAction,
} from "@/app/actions";

export type DayBlock = { day: ProgramDay; exercises: DayExercise[] };

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

export function ProgramEditor({
  program,
  programs,
  days,
  library,
}: {
  program: Program;
  programs: Program[];
  days: DayBlock[];
  library: Exercise[];
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button
          variant={editing ? "default" : "outline"}
          size="sm"
          onClick={() => setEditing((e) => !e)}
          className="gap-1"
        >
          {editing ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
          {editing ? "Done" : "Edit"}
        </Button>
      </div>

      {editing && <ProgramManager program={program} programs={programs} />}

      {editing ? (
        <div className="flex flex-col gap-4">
          {days.map(({ day, exercises }) => (
            <EditableDay
              key={day.id}
              day={day}
              exercises={exercises}
              library={library}
            />
          ))}
          <AddDay programId={program.id} nextWeekday={nextFreeWeekday(days)} />
        </div>
      ) : (
        <ReadOnlyDays days={days} />
      )}
    </div>
  );
}

// --- View mode -------------------------------------------------------------

function ReadOnlyDays({ days }: { days: DayBlock[] }) {
  return (
    <div className="flex flex-col gap-4">
      {days.map(({ day, exercises }) => (
        <Card key={day.id} className="py-4">
          <div className="flex items-baseline justify-between px-4">
            <h2 className="font-medium">{day.name}</h2>
            <span className="text-xs text-muted-foreground">
              {weekdayName(day.dayOfWeek)}
            </span>
          </div>
          <ul className="flex flex-col">
            {exercises.map((ex) => (
              <li
                key={ex.prescriptionId}
                className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2 text-sm last:border-b-0"
              >
                <Link
                  href={`/exercises/${ex.exerciseId}`}
                  className="flex min-w-0 items-center gap-1.5 hover:text-primary"
                >
                  {ex.injuryNote && (
                    <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
                  )}
                  <span className="truncate">{ex.name}</span>
                </Link>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {ex.targetSets} × {ex.repMin}–{ex.repMax}
                </span>
              </li>
            ))}
            {exercises.length === 0 && (
              <li className="px-4 py-2 text-sm text-muted-foreground">
                No exercises yet.
              </li>
            )}
          </ul>
        </Card>
      ))}
    </div>
  );
}

// --- Program manager (switch / create / rename / archive) ------------------

function ProgramManager({
  program,
  programs,
}: {
  program: Program;
  programs: Program[];
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [, startTransition] = useTransition();

  const run = (fn: () => Promise<unknown>) => startTransition(() => void fn());

  return (
    <Card className="mb-4 gap-0 py-3">
      <div className="flex items-center gap-2 px-3">
        <Input
          defaultValue={program.name}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== program.name)
              run(() => renameProgramAction({ id: program.id, name }));
          }}
          className="h-9 flex-1 font-medium"
          aria-label="Program name"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen((o) => !o)}
          className="gap-1"
        >
          Programs
          {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </Button>
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-1.5 px-3 pb-1">
          {programs.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-sm"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{p.name}</span>
                {p.isActive && (
                  <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[0.65rem] font-medium text-primary">
                    Active
                  </span>
                )}
                {p.archivedAt && (
                  <span className="shrink-0 text-[0.65rem] text-muted-foreground">
                    archived
                  </span>
                )}
              </span>
              <span className="flex shrink-0 gap-1">
                {!p.isActive && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => run(() => setActiveProgramAction({ id: p.id }))}
                  >
                    Activate
                  </Button>
                )}
                {p.archivedAt ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Restore program"
                    onClick={() => run(() => restoreProgramAction({ id: p.id }))}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                ) : (
                  !p.isActive && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Archive program"
                      onClick={() => run(() => archiveProgramAction({ id: p.id }))}
                    >
                      <Archive className="size-3.5" />
                    </Button>
                  )
                )}
              </span>
            </div>
          ))}

          {creating ? (
            <div className="flex gap-1.5 pt-1">
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New program name"
                className="h-8 flex-1"
              />
              <Button
                size="sm"
                onClick={() => {
                  const name = newName.trim();
                  if (!name) return;
                  run(async () => {
                    await createProgramAction({ name });
                  });
                  setNewName("");
                  setCreating(false);
                }}
              >
                Create
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreating(true)}
              className="mt-1 w-full gap-1"
            >
              <Plus className="size-3.5" />
              New program
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

// --- Editable day ----------------------------------------------------------

function EditableDay({
  day,
  exercises,
  library,
}: {
  day: ProgramDay;
  exercises: DayExercise[];
  library: Exercise[];
}) {
  const [picking, setPicking] = useState(false);
  const [, startTransition] = useTransition();
  const run = (fn: () => Promise<unknown>) => startTransition(() => void fn());
  const existingIds = new Set(exercises.map((e) => e.exerciseId));

  return (
    <Card className="gap-2 py-4">
      <div className="flex items-center gap-2 px-4">
        <Input
          defaultValue={day.name}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== day.name)
              run(() => renameDayAction({ id: day.id, name }));
          }}
          className="h-9 flex-1 font-medium"
          aria-label="Day name"
        />
        <select
          defaultValue={day.dayOfWeek}
          onChange={(e) =>
            run(() => setDayOfWeekAction({ id: day.id, dayOfWeek: Number(e.target.value) }))
          }
          aria-label="Day of week"
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring"
        >
          {WEEKDAYS.map((d) => (
            <option key={d} value={d}>
              {weekdayName(d).slice(0, 3)}
            </option>
          ))}
        </select>
      </div>

      <ul className="flex flex-col">
        {exercises.map((ex, i) => (
          <PrescriptionRow
            key={ex.prescriptionId}
            rx={ex}
            isFirst={i === 0}
            isLast={i === exercises.length - 1}
          />
        ))}
      </ul>

      {picking ? (
        <div className="px-4">
          <ExercisePicker
            dayId={day.id}
            library={library}
            existingIds={existingIds}
            onDone={() => setPicking(false)}
          />
        </div>
      ) : (
        <div className="flex items-center justify-between px-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPicking(true)}
            className="gap-1"
          >
            <Plus className="size-3.5" />
            Add exercise
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm(`Remove "${day.name}" and all its exercises?`))
                run(() => removeDayAction({ id: day.id }));
            }}
            className="gap-1 text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            Remove day
          </Button>
        </div>
      )}
    </Card>
  );
}

function PrescriptionRow({
  rx,
  isFirst,
  isLast,
}: {
  rx: DayExercise;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [sets, setSets] = useState(rx.targetSets);
  const [lo, setLo] = useState(rx.repMin);
  const [hi, setHi] = useState(rx.repMax);
  const [, startTransition] = useTransition();

  const commit = () => {
    const targetSets = Math.max(1, sets || 1);
    const repMin = Math.max(1, lo || 1);
    const repMax = Math.max(repMin, hi || repMin);
    setSets(targetSets);
    setLo(repMin);
    setHi(repMax);
    startTransition(() =>
      void updatePrescriptionAction({ id: rx.prescriptionId, targetSets, repMin, repMax })
    );
  };

  const move = (direction: "up" | "down") =>
    startTransition(() => void reorderPrescriptionAction({ id: rx.prescriptionId, direction }));

  return (
    <li className="flex items-center gap-2 border-b border-border/60 px-4 py-2 last:border-b-0">
      <div className="flex flex-col">
        <button
          type="button"
          aria-label="Move up"
          disabled={isFirst}
          onClick={() => move("up")}
          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          <ChevronUp className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Move down"
          disabled={isLast}
          onClick={() => move("down")}
          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          <ChevronDown className="size-3.5" />
        </button>
      </div>

      <span className="min-w-0 flex-1 truncate text-sm">{rx.name}</span>

      <div className="flex items-center gap-1 tabular-nums">
        <NumberCell value={sets} onChange={setSets} onCommit={commit} label="sets" />
        <span className="text-muted-foreground">×</span>
        <NumberCell value={lo} onChange={setLo} onCommit={commit} label="min reps" />
        <span className="text-muted-foreground">–</span>
        <NumberCell value={hi} onChange={setHi} onCommit={commit} label="max reps" />
      </div>

      <button
        type="button"
        aria-label={`Remove ${rx.name}`}
        onClick={() =>
          startTransition(() => void removePrescriptionAction({ id: rx.prescriptionId }))
        }
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

function NumberCell({
  value,
  onChange,
  onCommit,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  onCommit: () => void;
  label: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      aria-label={label}
      value={Number.isNaN(value) ? "" : value}
      onChange={(e) => onChange(parseInt(e.target.value, 10))}
      onBlur={onCommit}
      className="h-8 w-11 rounded-lg border border-input bg-transparent text-center text-sm outline-none focus-visible:border-ring"
    />
  );
}

// --- Add day ---------------------------------------------------------------

function AddDay({ programId, nextWeekday }: { programId: string; nextWeekday: number }) {
  const [, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      onClick={() =>
        startTransition(() =>
          void addProgramDayAction({ programId, name: "New day", dayOfWeek: nextWeekday })
        )
      }
      className="h-11 w-full gap-1.5"
    >
      <Plus className="size-4" />
      Add training day
    </Button>
  );
}

/** First weekday not already used by a day (falls back to Monday). */
function nextFreeWeekday(days: DayBlock[]): number {
  const used = new Set(days.map((d) => d.day.dayOfWeek));
  return WEEKDAYS.find((d) => !used.has(d)) ?? 1;
}
