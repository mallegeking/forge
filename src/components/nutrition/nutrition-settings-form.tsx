"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SlidersHorizontal, Check } from "lucide-react";
import { saveNutritionAction } from "@/app/actions";
import { useT } from "@/components/i18n/i18n-provider";
import type { ActivityLevel, Goal } from "@/lib/nutrition";

const ACTIVITY_IDS: ActivityLevel[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
];
const GOAL_IDS: Goal[] = ["cut", "maintain", "gain"];

type Current = {
  activity: ActivityLevel;
  goal: Goal;
  calorieOverride: number | null;
  proteinOverride: number | null;
  preferences: string;
};

export function NutritionSettingsForm({ current }: { current: Current }) {
  const t = useT();
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
        {t.nutrition.adjustTargets}
      </Button>
    );
  }

  return (
    <Card className="gap-4 p-4">
      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t.nutrition.activity}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ACTIVITY_IDS.map((id) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={activity === id ? "default" : "outline"}
              onClick={() => setActivity(id)}
            >
              {t.nutrition.activityLabels[id]}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t.nutrition.goalLabel}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {GOAL_IDS.map((id) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={goal === id ? "default" : "outline"}
              onClick={() => setGoal(id)}
            >
              {t.nutrition.goalLabels[id]}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {t.nutrition.caloriesOverride}{" "}
            <span className="text-muted-foreground/70">
              {t.nutrition.overrideHint}
            </span>
          </span>
          <Input
            type="number"
            inputMode="numeric"
            value={calorie}
            onChange={(e) => setCalorie(e.target.value)}
            placeholder={t.nutrition.auto}
            className="h-11"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {t.nutrition.proteinOverride}{" "}
            <span className="text-muted-foreground/70">
              {t.nutrition.overrideHint}
            </span>
          </span>
          <Input
            type="number"
            inputMode="numeric"
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            placeholder={t.nutrition.auto}
            className="h-11"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">
          {t.nutrition.preferences}
        </span>
        <Textarea
          value={preferences}
          onChange={(e) => setPreferences(e.target.value)}
          placeholder={t.nutrition.preferencesPlaceholder}
          rows={2}
          className="resize-none"
        />
      </label>

      <div className="flex items-center gap-2">
        <Button type="button" onClick={save} disabled={pending} className="flex-1 gap-1.5">
          {saved && <Check className="size-4" />}
          {saved ? t.common.saved : t.common.save}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {t.common.done}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {t.nutrition.autoComputedHint}
      </p>
    </Card>
  );
}
