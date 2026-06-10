"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  ChevronRight,
  Minus,
  Plus,
  TrendingUp,
  Trash2,
  Moon,
} from "lucide-react";
import { useRestTimer } from "@/components/session/rest-timer";
import {
  isReadyToIncrease,
  suggestIncrement,
  deloadAdjust,
} from "@/lib/progression";
import { formatSet, formatWeight, formatRelativeDay } from "@/lib/format";
import { logSetAction, deleteSetAction, saveNoteAction } from "@/app/actions";
import { useT, useLocale } from "@/components/i18n/i18n-provider";
import type { SessionExerciseView, LoggedSetRow } from "@/lib/queries";

export function ExerciseCard({
  ex,
  sessionId,
  isDeload = false,
}: {
  ex: SessionExerciseView;
  sessionId: string;
  isDeload?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const { startRest } = useRestTimer();
  const [, startTransition] = useTransition();
  const [sets, setSets] = useState<LoggedSetRow[]>(ex.loggedSets);

  // On a deload week, cut the sets and seed a lighter starting weight.
  const deload = isDeload
    ? deloadAdjust({
        targetSets: ex.targetSets,
        repMin: ex.repMin,
        repMax: ex.repMax,
      })
    : null;

  const fromHistory = ex.lastSession?.sets[0]?.weightKg ?? 0;
  const seedWeight =
    sets.at(-1)?.weightKg ??
    (deload && fromHistory > 0
      ? Math.round((fromHistory * deload.loadFactor) / 2.5) * 2.5
      : fromHistory);
  const [weight, setWeight] = useState<number>(seedWeight);
  const [reps, setReps] = useState<number>(ex.repMax);
  const [note, setNote] = useState(ex.note ?? "");

  const addSet = () => {
    const tempId = `temp-${Date.now()}`;
    const optimistic: LoggedSetRow = {
      id: tempId,
      setNumber: sets.length + 1,
      weightKg: weight,
      reps,
    };
    setSets((prev) => [...prev, optimistic]);
    startRest(ex.defaultRestSeconds);
    startTransition(async () => {
      const saved = await logSetAction({
        sessionId,
        exerciseId: ex.exerciseId,
        weightKg: weight,
        reps,
      });
      setSets((prev) =>
        prev.map((s) =>
          s.id === tempId ? { ...s, id: saved.id, setNumber: saved.setNumber } : s
        )
      );
    });
  };

  const removeSet = (id: string) => {
    setSets((prev) => prev.filter((s) => s.id !== id));
    if (!id.startsWith("temp-")) {
      startTransition(async () => {
        await deleteSetAction({ id, sessionId });
      });
    }
  };

  const saveNote = () => {
    if (note.trim() === (ex.note ?? "")) return;
    startTransition(async () => {
      await saveNoteAction({ sessionId, exerciseId: ex.exerciseId, note });
    });
  };

  const ready = isReadyToIncrease(
    sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps })),
    { targetSets: ex.targetSets, repMin: ex.repMin, repMax: ex.repMax }
  );
  const inc = suggestIncrement(ex.type);

  return (
    <Card className="gap-3 py-4">
      <div className="flex items-start justify-between gap-2 px-4">
        <div className="min-w-0">
          <Link
            href={`/exercises/${ex.exerciseId}`}
            className="flex items-center gap-1 font-medium hover:text-primary"
          >
            <span className="truncate">{ex.name}</span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {deload ? deload.targetSets : ex.targetSets} {t.session.sets} · {ex.repMin}–
            {ex.repMax} {t.session.reps} · <span>{t.exerciseTypes[ex.type]}</span>
            {deload && <span className="text-primary"> · {t.session.deload}</span>}
          </p>
        </div>
      </div>

      {ex.injuryNote && (
        <div className="mx-4 flex gap-2 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{ex.injuryNote}</span>
        </div>
      )}

      {deload && (
        <div className="mx-4 flex items-center gap-2 rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
          <Moon className="size-4 shrink-0" />
          <span>
            {t.session.deloadNotice1} {Math.round(deload.loadFactor * 100)}%{" "}
            {t.session.deloadNotice2} {deload.targetSets} {t.session.deloadNotice3}
          </span>
        </div>
      )}

      <div className="px-4 text-xs text-muted-foreground">
        {ex.lastSession ? (
          <span>
            {t.session.lastTime}{" "}
            {formatRelativeDay(ex.lastSession.performedAt, t.common, locale)} ·{" "}
            <span className="text-foreground">
              {ex.lastSession.sets.map((s) => formatSet(s.weightKg, s.reps)).join(", ")}
            </span>
          </span>
        ) : (
          <span>{t.session.firstTime}</span>
        )}
      </div>

      {/* Logged sets */}
      {sets.length > 0 && (
        <ul className="mx-4 flex flex-col gap-1">
          {sets.map((s, i) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-lg bg-muted/50 py-1.5 pr-1.5 pl-3 text-sm"
            >
              <span className="tabular-nums">
                <span className="text-muted-foreground">
                  {t.session.set} {i + 1}
                </span>{" "}
                <span className="font-medium">{formatSet(s.weightKg, s.reps)}</span>
              </span>
              <button
                type="button"
                onClick={() => removeSet(s.id)}
                aria-label={`${t.session.deleteSet} ${i + 1}`}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {ready && !isDeload && (
        <div className="mx-4 flex items-center gap-2 rounded-lg bg-success/10 p-2.5 text-xs text-success">
          <TrendingUp className="size-4 shrink-0" />
          <span>
            {t.session.readyPrefix} {formatWeight(inc.min)}–{formatWeight(inc.max)}
            {t.session.readySuffix}
          </span>
        </div>
      )}

      {/* Logger */}
      <div className="mx-4 flex items-end gap-2">
        <Stepper
          label={t.session.kg}
          value={weight}
          step={2.5}
          min={0}
          inputMode="decimal"
          onChange={setWeight}
        />
        <Stepper
          label={t.session.reps}
          value={reps}
          step={1}
          min={0}
          inputMode="numeric"
          onChange={setReps}
        />
        <Button
          type="button"
          onClick={addSet}
          className="h-11 flex-1 gap-1 text-sm font-medium"
        >
          <Plus className="size-4" />
          {t.session.addSet}
        </Button>
      </div>

      <div className="px-4">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          placeholder={t.session.notePlaceholder}
          className="min-h-0 resize-none text-sm"
          rows={1}
        />
      </div>
    </Card>
  );
}

function Stepper({
  label,
  value,
  step,
  min,
  inputMode,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  inputMode: "decimal" | "numeric";
  onChange: (v: number) => void;
}) {
  const t = useT();
  const clamp = (v: number) => {
    const n = Number.isFinite(v) ? v : min;
    return Math.max(min, Math.round(n * 100) / 100);
  };
  return (
    <div className="flex flex-col gap-1">
      <span className="text-center text-[0.65rem] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`${t.session.decrease} ${label}`}
          onClick={() => onChange(clamp(value - step))}
          className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground active:translate-y-px"
        >
          <Minus className="size-4" />
        </button>
        <Input
          inputMode={inputMode}
          type="number"
          step={step}
          value={Number.isNaN(value) ? "" : value}
          onChange={(e) => onChange(clamp(parseFloat(e.target.value)))}
          className="h-9 w-14 px-1 text-center text-base font-medium tabular-nums"
        />
        <button
          type="button"
          aria-label={`${t.session.increase} ${label}`}
          onClick={() => onChange(clamp(value + step))}
          className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground active:translate-y-px"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}
