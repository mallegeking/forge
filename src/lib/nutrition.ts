// Pure nutrition math + the AI grocery-recommendation prompt layer. Targets are
// derived from the athlete's latest bodyweight, an activity level, and a goal —
// no food diary, no per-meal logging. Everything here is pure (no DB, no network)
// so it unit-tests like bodyweight.ts / progression.ts and the brief it builds
// for the model stays cheap to reason about.
//
// Maintenance uses a bodyweight × activity heuristic (kcal per kg of bodyweight)
// rather than Mifflin–St Jeor, because the app already tracks bodyweight but not
// height/age/sex — so this needs no extra profile and the athlete can always
// override the final numbers.

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

export type Goal = "cut" | "maintain" | "gain";

/** kcal per kg of bodyweight per day, by training/activity load. */
const ACTIVITY_KCAL_PER_KG: Record<ActivityLevel, number> = {
  sedentary: 26,
  light: 29,
  moderate: 31,
  active: 34,
  very_active: 37,
};

/** Daily kcal delta applied to maintenance for each goal. */
const GOAL_KCAL_DELTA: Record<Goal, number> = {
  cut: -500,
  maintain: 0,
  gain: 250,
};

/** Protein target in grams per kg of bodyweight, by goal (higher on a cut). */
const PROTEIN_G_PER_KG: Record<Goal, number> = {
  cut: 2.2,
  maintain: 1.8,
  gain: 2.0,
};

const GOAL_LABEL: Record<Goal, string> = {
  cut: "cut",
  maintain: "maintain",
  gain: "lean gain",
};

export const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  sedentary: "sedentary",
  light: "light",
  moderate: "moderate",
  active: "active",
  very_active: "very active",
};

function round10(n: number): number {
  return Math.round(n / 10) * 10;
}

function round5(n: number): number {
  return Math.round(n / 5) * 5;
}

/** Estimated maintenance calories, rounded to the nearest 10 kcal. */
export function estimateMaintenance(
  weightKg: number,
  activity: ActivityLevel
): number {
  return round10(weightKg * ACTIVITY_KCAL_PER_KG[activity]);
}

/** The kcal delta + a human label for a goal. */
export function goalAdjustment(goal: Goal): { kcalDelta: number; label: string } {
  return { kcalDelta: GOAL_KCAL_DELTA[goal], label: GOAL_LABEL[goal] };
}

/** Protein target in grams, rounded to the nearest 5 g. */
export function proteinTargetGrams(weightKg: number, goal: Goal): number {
  return round5(weightKg * PROTEIN_G_PER_KG[goal]);
}

export type NutritionTargets = {
  calories: number;
  proteinG: number;
  /** The estimated maintenance the calorie target was derived from. */
  maintenance: number;
  /** Whether the numbers shown are auto-computed or a manual override. */
  source: "auto" | "override";
};

export type ComputeTargetsInput = {
  weightKg: number;
  activity: ActivityLevel;
  goal: Goal;
  /** Manual overrides — a positive number wins over the auto estimate. */
  calorieOverride?: number | null;
  proteinOverride?: number | null;
};

/**
 * Resolve the daily calorie + protein targets. Auto-computed from bodyweight,
 * activity, and goal; a positive override replaces the matching auto value.
 * `source` is "override" when either field was overridden.
 */
export function computeTargets(input: ComputeTargetsInput): NutritionTargets {
  const { weightKg, activity, goal, calorieOverride, proteinOverride } = input;
  const maintenance = estimateMaintenance(weightKg, activity);
  const autoCalories = round10(maintenance + GOAL_KCAL_DELTA[goal]);
  const autoProtein = proteinTargetGrams(weightKg, goal);

  const calOverridden = !!calorieOverride && calorieOverride > 0;
  const proOverridden = !!proteinOverride && proteinOverride > 0;

  return {
    calories: calOverridden ? Math.round(calorieOverride!) : autoCalories,
    proteinG: proOverridden ? Math.round(proteinOverride!) : autoProtein,
    maintenance,
    source: calOverridden || proOverridden ? "override" : "auto",
  };
}

export const NUTRITION_SYSTEM_PROMPT = `You are Forge's nutrition coach — an expert in sports nutrition for strength training. You speak directly to the athlete who trains and logs their lifts here.

You will be given the athlete's daily calorie and protein targets, their goal (cut, maintain, or lean gain), current bodyweight and its recent trend, a short summary of their training, and any food preferences or restrictions they've stated.

Your job, when asked, is to produce a practical WEEKLY GROCERY LIST plus a few meal ideas that make hitting those targets easy.

How to do it:
- Ground everything in the targets and data provided. Never invent the athlete's weight, training, or numbers. If something isn't given, give sensible general guidance rather than making it up.
- Prioritise protein — the protein target is the one that matters most for training. Favour affordable, high-protein staples.
- ALWAYS honour stated preferences, allergies, and restrictions (e.g. vegetarian, no dairy, budget). Never suggest something the athlete said they can't or won't eat.
- BEGIN your reply with a protein-dense staples block: 5–8 lines, each exactly of the form [[item|<food name>|<protein grams per 100 g, integer>]] with nothing else on the line. Pick staples that fit the targets and any stated restrictions. Use realistic protein densities. Never mention this syntax in prose.
- Then continue with the rest, structured for a phone: a grocery list grouped by category (Protein, Carbs, Produce, Fats, Extras), then 2–3 simple meal ideas that together roughly hit the daily calorie and protein targets. Note approximate protein per meal.
- Be concise and skimmable. No long preamble — lead with the list.`;

export type NutritionBriefInput = {
  targets: NutritionTargets;
  goal: Goal;
  activity: ActivityLevel;
  weightKg: number;
  /** Net weekly-average change in kg, or null when there isn't enough history. */
  weightTrendKg: number | null;
  /** A compact training summary (e.g. the coach's brief), or null. */
  trainingSummary: string | null;
  /** Free-text preferences/allergies/budget, or null. */
  preferences: string | null;
};

/** Build the compact brief handed to the model as context. Pure over its input. */
export function buildNutritionBrief(input: NutritionBriefInput): string {
  const { targets, goal, activity, weightKg, weightTrendKg, trainingSummary, preferences } =
    input;

  const trend =
    weightTrendKg == null
      ? "not enough weigh-ins yet for a trend"
      : weightTrendKg === 0
        ? "holding steady"
        : `${weightTrendKg > 0 ? "+" : ""}${weightTrendKg}kg over recent weeks`;

  const lines = [
    `Goal: ${GOAL_LABEL[goal]}. Activity: ${ACTIVITY_LABEL[activity]}.`,
    `Bodyweight: ${weightKg}kg (${trend}).`,
    `Daily targets: ${targets.calories} kcal, ${targets.proteinG}g protein (maintenance ≈ ${targets.maintenance} kcal).`,
    preferences && preferences.trim().length > 0
      ? `Preferences / restrictions: ${preferences.trim()}`
      : `Preferences / restrictions: none stated.`,
  ];

  if (trainingSummary && trainingSummary.trim().length > 0) {
    lines.push(`\nTraining context:\n${trainingSummary.trim()}`);
  }

  return lines.join("\n");
}
