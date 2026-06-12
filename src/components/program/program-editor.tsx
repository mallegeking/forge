"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  ChevronDown,
  ChevronLeft,
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
import { useT } from "@/components/i18n/i18n-provider";
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

/** ISO weekday for today: 1 = Monday … 7 = Sunday. */
function todayWeekday(): number {
  return ((new Date().getDay() + 6) % 7) + 1;
}

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
  const t = useT();
  const [editing, setEditing] = useState(false);

  return (
    <div className="-mx-4 -mt-5 animate-[fadeIn_0.3s_ease] px-[22px] pb-2">
      {/* Header: back · PROGRAM wordmark + caption · EDIT pill */}
      <header className="-mx-[22px] flex items-center justify-between px-[22px] pt-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href="/"
            aria-label={t.common.back}
            className="-m-1.5 shrink-0 p-1.5 text-muted-foreground"
          >
            <ChevronLeft className="size-[18px]" strokeWidth={2.2} />
          </Link>
          <div className="flex min-w-0 flex-col">
            <span className="font-display text-[17px] font-bold leading-none tracking-[0.14em] uppercase">
              {t.program.title}
            </span>
            <span className="mt-1 truncate text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              {days.length}
              {t.program.daySplit} · {t.program.active}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-[7px] ${
            editing
              ? "bg-primary text-primary-foreground"
              : "border border-input text-foreground"
          }`}
        >
          {editing ? (
            <Check className="size-3" strokeWidth={2.2} />
          ) : (
            <Pencil className="size-3" strokeWidth={2.2} />
          )}
          <span className="font-display text-[13px] font-semibold tracking-[0.14em] uppercase">
            {editing ? t.program.done : t.program.edit}
          </span>
        </button>
      </header>

      <div className="pt-[18px]">
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
          <CollapsibleDays days={days} />
        )}
      </div>
    </div>
  );
}

// --- View mode: collapsible day rows ----------------------------------------

function CollapsibleDays({ days }: { days: DayBlock[] }) {
  const t = useT();
  // Today's training day starts expanded — it's the one you came to check.
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    const today = days.find((d) => d.day.dayOfWeek === todayWeekday());
    return new Set(today ? [today.day.id] : []);
  });

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-2">
      {days.map(({ day, exercises }) => {
        const open = openIds.has(day.id);
        return (
          <div
            key={day.id}
            className={`rounded-[14px] bg-card ${
              open ? "border border-primary/35 px-4 pt-3 pb-1.5" : "px-4 py-3"
            }`}
          >
            <button
              type="button"
              onClick={() => toggle(day.id)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-2.5"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span
                  className={`w-[30px] shrink-0 text-left text-[10px] tracking-[0.18em] uppercase ${
                    open ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {t.weekdaysShort[day.dayOfWeek]}
                </span>
                <span className="truncate font-display text-[19px] font-semibold tracking-[0.06em] uppercase">
                  {day.name}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2.5">
                {!open && (
                  <span className="text-[11px] text-muted-foreground">
                    {exercises.length} {t.home.exercises}
                  </span>
                )}
                {open ? (
                  <ChevronUp className="size-[13px] text-muted-foreground" strokeWidth={2.4} />
                ) : (
                  <ChevronDown className="size-[13px] text-muted-foreground" strokeWidth={2.4} />
                )}
              </span>
            </button>

            {open && (
              <ul className="mt-2.5 flex flex-col">
                {exercises.map((ex, i) => (
                  <li
                    key={ex.prescriptionId}
                    className={`flex items-center justify-between gap-2.5 py-2 ${
                      i < exercises.length - 1
                        ? "border-b border-foreground/[0.06]"
                        : ""
                    }`}
                  >
                    <Link
                      href={`/exercises/${ex.exerciseId}`}
                      className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium hover:text-primary"
                    >
                      {ex.injuryNote && (
                        <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
                      )}
                      <span className="truncate">{ex.name}</span>
                    </Link>
                    <span className="shrink-0 font-display text-[14px] font-semibold tracking-[0.08em] text-muted-foreground">
                      {ex.targetSets} × {ex.repMin}–{ex.repMax}
                    </span>
                  </li>
                ))}
                {exercises.length === 0 && (
                  <li className="py-2 text-[13px] text-muted-foreground">
                    {t.program.noExercises}
                  </li>
                )}
              </ul>
            )}
          </div>
        );
      })}
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
  const t = useT();
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
          aria-label={t.program.programName}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen((o) => !o)}
          className="gap-1"
        >
          {t.program.programs}
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
                    {t.program.active}
                  </span>
                )}
                {p.archivedAt && (
                  <span className="shrink-0 text-[0.65rem] text-muted-foreground">
                    {t.program.archived}
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
                    {t.program.activate}
                  </Button>
                )}
                {p.archivedAt ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t.program.restoreProgram}
                    onClick={() => run(() => restoreProgramAction({ id: p.id }))}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                ) : (
                  !p.isActive && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t.program.archiveProgram}
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
                placeholder={t.program.newProgramName}
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
                {t.program.create}
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
              {t.program.newProgram}
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
  const t = useT();
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
          aria-label={t.program.dayName}
        />
        <select
          defaultValue={day.dayOfWeek}
          onChange={(e) =>
            run(() => setDayOfWeekAction({ id: day.id, dayOfWeek: Number(e.target.value) }))
          }
          aria-label={t.program.dayOfWeek}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring"
        >
          {WEEKDAYS.map((d) => (
            <option key={d} value={d}>
              {t.weekdaysShort[d]}
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
            {t.program.addExercise}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (
                confirm(
                  `${t.program.confirmRemoveDay} "${day.name}" ${t.program.confirmRemoveDaySuffix}`,
                )
              )
                run(() => removeDayAction({ id: day.id }));
            }}
            className="gap-1 text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            {t.program.removeDay}
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
  const t = useT();
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
          aria-label={t.program.moveUp}
          disabled={isFirst}
          onClick={() => move("up")}
          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          <ChevronUp className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={t.program.moveDown}
          disabled={isLast}
          onClick={() => move("down")}
          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          <ChevronDown className="size-3.5" />
        </button>
      </div>

      <span className="min-w-0 flex-1 truncate text-sm">{rx.name}</span>

      <div className="flex items-center gap-1 tabular-nums">
        <NumberCell value={sets} onChange={setSets} onCommit={commit} label={t.program.setsLabel} />
        <span className="text-muted-foreground">×</span>
        <NumberCell value={lo} onChange={setLo} onCommit={commit} label={t.program.minRepsLabel} />
        <span className="text-muted-foreground">–</span>
        <NumberCell value={hi} onChange={setHi} onCommit={commit} label={t.program.maxRepsLabel} />
      </div>

      <button
        type="button"
        aria-label={`${t.program.remove} ${rx.name}`}
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
  const t = useT();
  const [, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() =>
        startTransition(() =>
          void addProgramDayAction({ programId, name: t.program.newDay, dayOfWeek: nextWeekday })
        )
      }
      className="flex h-12 w-full items-center justify-center gap-2 rounded-[13px] border-[1.5px] border-dashed border-foreground/20 text-muted-foreground"
    >
      <Plus className="size-3.5" strokeWidth={2.4} />
      <span className="font-display text-[15px] font-semibold tracking-[0.14em] uppercase">
        {t.program.addTrainingDay}
      </span>
    </button>
  );
}

/** First weekday not already used by a day (falls back to Monday). */
function nextFreeWeekday(days: DayBlock[]): number {
  const used = new Set(days.map((d) => d.day.dayOfWeek));
  return WEEKDAYS.find((d) => !used.has(d)) ?? 1;
}
