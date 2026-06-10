"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SlidersHorizontal, Check } from "lucide-react";
import { saveNutritionAction } from "@/app/actions";
import type { ActivityLevel, Goal } from "@/lib/nutrition";

const ACTIVITIES: { id: ActivityLevel; label: string }[] = [
  { id: "sedentary", label: "Sedentary" },
  { id: "light", label: "Light" },
  { id: "moderate", label: "Moderate" },
  { id: "active", label: "Active" },
  { id: "very_active", label: "Very active" },
];

const GOALS: { id: Goal; label: string }[] = [
  { id: "cut", label: "Cut" },
  { id: "maintain", label: "Maintain" },
  { id: "gain", label: "Lean gain" },
];

type Current = {
  activity: ActivityLevel;
  goal: Goal;
  calorieOverride: number | null;
  proteinOverride: number | null;
  preferences: string;
};

export function NutritionSettingsForm({ current }: { current: Current }) {
  const [open, setOpen] = useState(false);
  const [activity, setActivity] = useState<ActivityLevel>(current.activity);
  const [goal, setGoal] = useState<Goal>(current.goal);
  const [calorie, setCalorie] = useState(
    current.calorieOverride ? String(current.calorieOverride) : ""
  );
  const [protein, setProtein] = useState(
    current.proteinOverride ? String(current.proteinOverride) : ""
  );
  const [preferences, setPreferences] = useState(current.preferences);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      await saveNutritionAction({
        activity,
        goal,
        calorieOverride: calorie,
        proteinOverride: protein,
        preferences,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="w-full gap-1.5"
      >
        <SlidersHorizontal className="size-4" />
        Adjust targets
      </Button>
    );
  }

  return (
    <Card className="gap-4 p-4">
      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Activity
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ACTIVITIES.map((a) => (
            <Button
              key={a.id}
              type="button"
              size="sm"
              variant={activity === a.id ? "default" : "outline"}
              onClick={() => setActivity(a.id)}
            >
              {a.label}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Goal
        </p>
        <div className="flex flex-wrap gap-1.5">
          {GOALS.map((g) => (
            <Button
              key={g.id}
              type="button"
              size="sm"
              variant={goal === g.id ? "default" : "outline"}
              onClick={() => setGoal(g.id)}
            >
              {g.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            Calories <span className="text-muted-foreground/70">(override)</span>
          </span>
          <Input
            type="number"
            inputMode="numeric"
            value={calorie}
            onChange={(e) => setCalorie(e.target.value)}
            placeholder="auto"
            className="h-11"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            Protein g <span className="text-muted-foreground/70">(override)</span>
          </span>
          <Input
            type="number"
            inputMode="numeric"
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            placeholder="auto"
            className="h-11"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">
          Preferences / restrictions
        </span>
        <Textarea
          value={preferences}
          onChange={(e) => setPreferences(e.target.value)}
          placeholder="e.g. vegetarian, no dairy, on a budget"
          rows={2}
          className="resize-none"
        />
      </label>

      <div className="flex items-center gap-2">
        <Button type="button" onClick={save} disabled={pending} className="flex-1 gap-1.5">
          {saved && <Check className="size-4" />}
          {saved ? "Saved" : "Save"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Done
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Targets are auto-computed from your latest bodyweight. Leave the overrides
        blank to follow the estimate.
      </p>
    </Card>
  );
}
