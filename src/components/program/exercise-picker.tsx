"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import {
  addExerciseToDayAction,
  createExerciseAction,
} from "@/app/actions";
import { restSecondsFor } from "@/lib/progression";
import type { Exercise, ExerciseType } from "@/db/schema";

// New exercises are added with a sensible default prescription; the user tunes
// sets/reps inline afterwards.
const DEFAULT_RX = { targetSets: 3, repMin: 8, repMax: 12 };

export function ExercisePicker({
  dayId,
  library,
  existingIds,
  onDone,
}: {
  dayId: string;
  library: Exercise[];
  existingIds: Set<string>;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<ExerciseType>("compound");
  const [pending, startTransition] = useTransition();

  const q = query.trim().toLowerCase();
  const options = library.filter(
    (e) => !existingIds.has(e.id) && e.name.toLowerCase().includes(q)
  );

  const add = (exerciseId: string) => {
    startTransition(async () => {
      await addExerciseToDayAction({ dayId, exerciseId, ...DEFAULT_RX });
      onDone();
    });
  };

  const createAndAdd = () => {
    const name = newName.trim();
    if (!name || pending) return;
    startTransition(async () => {
      const id = await createExerciseAction({
        name,
        type: newType,
        defaultRestSeconds: restSecondsFor(newType),
      });
      await addExerciseToDayAction({ dayId, exerciseId: id, ...DEFAULT_RX });
      onDone();
    });
  };

  return (
    <div className="mt-2 rounded-xl border border-border bg-background/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Add exercise
        </span>
        <button
          type="button"
          aria-label="Close"
          onClick={onDone}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {creating ? (
        <div className="flex flex-col gap-2">
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Exercise name"
            className="h-9"
          />
          <div className="flex gap-1.5">
            {(["compound", "isolation"] as const).map((t) => (
              <Button
                key={t}
                type="button"
                size="sm"
                variant={newType === t ? "default" : "outline"}
                onClick={() => setNewType(t)}
                className="flex-1 capitalize"
              >
                {t}
              </Button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setCreating(false)}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={createAndAdd}
              disabled={pending || !newName.trim()}
              className="flex-1"
            >
              Create &amp; add
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search library…"
            className="mb-2 h-9"
          />
          <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {options.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => add(e.id)}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                >
                  <span className="truncate">{e.name}</span>
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground capitalize">
                    {e.type}
                  </span>
                </button>
              </li>
            ))}
            {options.length === 0 && (
              <li className="px-1 py-2 text-center text-xs text-muted-foreground">
                No matching exercises.
              </li>
            )}
          </ul>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setCreating(true);
              setNewName(query);
            }}
            className="mt-2 w-full gap-1"
          >
            <Plus className="size-3.5" />
            New exercise
          </Button>
        </>
      )}
    </div>
  );
}
