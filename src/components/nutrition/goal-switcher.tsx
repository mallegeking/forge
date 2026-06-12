"use client";

import { useState, useTransition } from "react";
import { saveNutritionAction } from "@/app/actions";
import { useT } from "@/components/i18n/i18n-provider";
import type { NutritionConfig } from "@/lib/nutrition-config";
import type { Goal } from "@/lib/nutrition";

const GOALS: Goal[] = ["cut", "maintain", "gain"];

// The Ember goal segmented control. Choosing a goal saves immediately and the
// server recomputes targets + derivation (the page revalidates via the action).
export function GoalSwitcher({ config }: { config: NutritionConfig }) {
  const t = useT();
  const [goal, setGoal] = useState<Goal>(config.goal);
  const [, startTransition] = useTransition();

  const choose = (g: Goal) => {
    if (g === goal) return;
    setGoal(g);
    startTransition(async () => {
      await saveNutritionAction({
        activity: config.activity,
        goal: g,
        calorieOverride: config.calorieOverride
          ? String(config.calorieOverride)
          : "",
        proteinOverride: config.proteinOverride
          ? String(config.proteinOverride)
          : "",
        preferences: config.preferences,
      });
    });
  };

  return (
    <div className="mt-2.5 grid grid-cols-3 gap-2">
      {GOALS.map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => choose(g)}
          className={`flex h-11 items-center justify-center rounded-[11px] font-display text-[15px] font-semibold tracking-[0.12em] uppercase transition-colors ${
            g === goal
              ? "bg-primary text-primary-foreground"
              : "border border-input text-muted-foreground"
          }`}
        >
          {t.nutrition.goalLabels[g]}
        </button>
      ))}
    </div>
  );
}
