// Server-side nutrition config: reads the athlete's nutrition settings (stored
// in the `settings` k/v table by the /nutrition screen) and their latest
// bodyweight, then resolves the daily calorie/protein targets via the pure
// `computeTargets`. Analogous to coach-config.ts. The /nutrition page and the
// grocery-recommendation route both call getNutritionConfig().

import { getSetting } from "@/lib/mutations";
import { getBodyweightEntries } from "@/lib/queries";
import { weeklyAverages, bodyweightTrend } from "@/lib/bodyweight";
import {
  computeTargets,
  type ActivityLevel,
  type Goal,
  type NutritionTargets,
} from "@/lib/nutrition";

const KEYS = {
  activity: "nutritionActivity",
  goal: "nutritionGoal",
  calorieOverride: "nutritionCalorieOverride",
  proteinOverride: "nutritionProteinOverride",
  preferences: "nutritionPreferences",
} as const;

const ACTIVITY_VALUES: readonly ActivityLevel[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
];
const GOAL_VALUES: readonly Goal[] = ["cut", "maintain", "gain"];

export type NutritionConfig = {
  activity: ActivityLevel;
  goal: Goal;
  calorieOverride: number | null;
  proteinOverride: number | null;
  preferences: string;
};

export type NutritionView = {
  config: NutritionConfig;
  /** Latest weigh-in in kg, or null when none logged yet. */
  latestWeightKg: number | null;
  /** Net weekly-average trend in kg, or null when <2 weeks of data. */
  weightTrendKg: number | null;
  /** Resolved targets, or null when there's no bodyweight to compute from. */
  targets: NutritionTargets | null;
};

function parseNumber(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function getNutritionConfig(): Promise<NutritionView> {
  const [activityRaw, goalRaw, calRaw, proRaw, prefsRaw, entries] =
    await Promise.all([
      getSetting(KEYS.activity),
      getSetting(KEYS.goal),
      getSetting(KEYS.calorieOverride),
      getSetting(KEYS.proteinOverride),
      getSetting(KEYS.preferences),
      getBodyweightEntries(),
    ]);

  const activity: ActivityLevel = ACTIVITY_VALUES.includes(
    activityRaw as ActivityLevel
  )
    ? (activityRaw as ActivityLevel)
    : "moderate";
  const goal: Goal = GOAL_VALUES.includes(goalRaw as Goal)
    ? (goalRaw as Goal)
    : "maintain";

  const config: NutritionConfig = {
    activity,
    goal,
    calorieOverride: parseNumber(calRaw),
    proteinOverride: parseNumber(proRaw),
    preferences: prefsRaw ?? "",
  };

  const latestWeightKg = entries.at(-1)?.weightKg ?? null;
  const weightTrendKg =
    entries.length > 0
      ? bodyweightTrend(
          weeklyAverages(
            entries.map((e) => ({ weightKg: e.weightKg, measuredAt: e.measuredAt }))
          )
        )
      : null;

  const targets =
    latestWeightKg != null
      ? computeTargets({
          weightKg: latestWeightKg,
          activity,
          goal,
          calorieOverride: config.calorieOverride,
          proteinOverride: config.proteinOverride,
        })
      : null;

  return { config, latestWeightKg, weightTrendKg, targets };
}
