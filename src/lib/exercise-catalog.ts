// A built-in catalog of common gym movements and machines, offered as
// suggestions in the exercise picker. Pure app data — nothing here touches the
// database: an entry only becomes a real `exercises` row when you pick it, so
// your library stays the list of things you actually train.
//
// This is deliberately NOT the seed (src/db/seed.ts). The seed holds YOUR 28
// movements with their injury notes and wipes the DB when it runs; the catalog
// is a superset you draw from while building a plan. Entries whose name already
// exists in the library are filtered out, so seeded lifts never show up twice.

import type { ExerciseType } from "./progression";

export type CatalogEntry = {
  name: string;
  /** compound = multi-joint (longer rest, bigger jumps); isolation otherwise. */
  type: ExerciseType;
  /** Weighted bodyweight lift — logged weights are ADDED load ("+7.5 kg"). */
  isBodyweightPlus?: boolean;
};

export const EXERCISE_CATALOG: CatalogEntry[] = [
  // --- Chest ---------------------------------------------------------------
  { name: "Barbell Bench Press", type: "compound" },
  { name: "Incline Barbell Press", type: "compound" },
  { name: "Decline Barbell Press", type: "compound" },
  { name: "Flat DB Press", type: "compound" },
  { name: "Incline DB Press", type: "compound" },
  { name: "Decline DB Press", type: "compound" },
  { name: "Chest Press Machine", type: "compound" },
  { name: "Incline Chest Press Machine", type: "compound" },
  { name: "Smith Machine Bench Press", type: "compound" },
  { name: "Push-Ups", type: "compound" },
  { name: "Weighted Dips (chest lean)", type: "compound", isBodyweightPlus: true },
  { name: "Pec Deck / Machine Fly", type: "isolation" },
  { name: "Cable Crossover (high to low)", type: "isolation" },
  { name: "Cable Crossover (low to high)", type: "isolation" },
  { name: "Incline DB Fly", type: "isolation" },
  { name: "Flat DB Fly", type: "isolation" },

  // --- Back ----------------------------------------------------------------
  { name: "Pull-Ups", type: "compound", isBodyweightPlus: true },
  { name: "Chin-Ups", type: "compound", isBodyweightPlus: true },
  { name: "Neutral-Grip Pull-Ups", type: "compound", isBodyweightPlus: true },
  { name: "Assisted Pull-Up Machine", type: "compound" },
  { name: "Lat Pulldown (wide grip)", type: "compound" },
  { name: "Lat Pulldown (neutral grip)", type: "compound" },
  { name: "Lat Pulldown (reverse grip)", type: "compound" },
  { name: "Barbell Row", type: "compound" },
  { name: "Pendlay Row", type: "compound" },
  { name: "T-Bar Row", type: "compound" },
  { name: "Chest-Supported Row Machine", type: "compound" },
  { name: "Seated Cable Row (wide)", type: "compound" },
  { name: "Single-Arm DB Row", type: "compound" },
  { name: "Landmine Row (narrow grip)", type: "compound" },
  { name: "Deadlift", type: "compound" },
  { name: "Rack Pull", type: "compound" },
  { name: "Straight-Arm Pulldown", type: "isolation" },
  { name: "Cable Pullover", type: "isolation" },
  { name: "Shrugs (DB)", type: "isolation" },
  { name: "Shrugs (Barbell)", type: "isolation" },

  // --- Shoulders -----------------------------------------------------------
  { name: "Overhead Press (Barbell)", type: "compound" },
  { name: "Seated DB Shoulder Press", type: "compound" },
  { name: "Arnold Press", type: "compound" },
  { name: "Shoulder Press Machine", type: "compound" },
  { name: "Smith Machine Shoulder Press", type: "compound" },
  { name: "Upright Row (Cable)", type: "compound" },
  { name: "Lateral Raise (DB)", type: "isolation" },
  { name: "Lateral Raise Machine", type: "isolation" },
  { name: "Cable Lateral Raise", type: "isolation" },
  { name: "Front Raise (DB)", type: "isolation" },
  { name: "Cable Front Raise", type: "isolation" },
  { name: "Reverse Pec Deck", type: "isolation" },
  { name: "Rear Delt Fly (DB)", type: "isolation" },
  { name: "Face Pulls", type: "isolation" },

  // --- Biceps --------------------------------------------------------------
  { name: "Barbell Curl", type: "isolation" },
  { name: "EZ-Bar Curl", type: "isolation" },
  { name: "DB Curl (alternating)", type: "isolation" },
  { name: "Hammer Curl (DB)", type: "isolation" },
  { name: "Incline DB Curl", type: "isolation" },
  { name: "Preacher Curl (Machine)", type: "isolation" },
  { name: "Preacher Curl (EZ-Bar)", type: "isolation" },
  { name: "Cable Curl (standing, single arm)", type: "isolation" },
  { name: "Cable Rope Hammer Curl", type: "isolation" },
  { name: "Concentration Curl", type: "isolation" },
  { name: "Spider Curl", type: "isolation" },
  { name: "Reverse Curl", type: "isolation" },

  // --- Triceps -------------------------------------------------------------
  { name: "Close-Grip Bench Press", type: "compound" },
  { name: "Weighted Dips (upright)", type: "compound", isBodyweightPlus: true },
  { name: "Assisted Dip Machine", type: "compound" },
  { name: "Tricep Rope Pushdown", type: "isolation" },
  { name: "Tricep Bar Pushdown", type: "isolation" },
  { name: "Tricep Overhead Extension", type: "isolation" },
  { name: "Overhead Cable Extension (rope)", type: "isolation" },
  { name: "Skullcrusher (EZ-Bar)", type: "isolation" },
  { name: "Tricep Kickback", type: "isolation" },
  { name: "Tricep Extension Machine", type: "isolation" },

  // --- Quads ---------------------------------------------------------------
  { name: "Barbell Squat", type: "compound" },
  { name: "Front Squat", type: "compound" },
  { name: "Hack Squat", type: "compound" },
  { name: "Smith Machine Squat", type: "compound" },
  { name: "Leg Press", type: "compound" },
  { name: "Bulgarian Split Squat", type: "compound" },
  { name: "Walking Lunges", type: "compound" },
  { name: "Reverse Lunges", type: "compound" },
  { name: "Step-Ups", type: "compound" },
  { name: "Goblet Squat", type: "compound" },
  { name: "Belt Squat", type: "compound" },
  { name: "Leg Extension", type: "isolation" },
  { name: "Sissy Squat", type: "isolation" },

  // --- Hamstrings & glutes -------------------------------------------------
  { name: "Romanian Deadlift", type: "compound" },
  { name: "Stiff-Legged Deadlift", type: "compound" },
  { name: "Sumo Deadlift", type: "compound" },
  { name: "Good Morning", type: "compound" },
  { name: "Hip Thrust", type: "compound" },
  { name: "Glute Bridge Machine", type: "compound" },
  { name: "Back Extension (45°)", type: "compound" },
  { name: "Lying Leg Curl", type: "isolation" },
  { name: "Seated Leg Curl", type: "isolation" },
  { name: "Nordic Curl", type: "isolation" },
  { name: "Cable Kickback", type: "isolation" },
  { name: "Hip Abduction Machine", type: "isolation" },
  { name: "Hip Adduction Machine", type: "isolation" },

  // --- Calves --------------------------------------------------------------
  { name: "Standing Calf Raise", type: "isolation" },
  { name: "Seated Calf Raise", type: "isolation" },
  { name: "Leg Press Calf Raise", type: "isolation" },
  { name: "Smith Machine Calf Raise", type: "isolation" },

  // --- Core ----------------------------------------------------------------
  { name: "Ab Machine", type: "isolation" },
  { name: "Cable Crunch", type: "isolation" },
  { name: "Hanging Leg Raise", type: "isolation" },
  { name: "Captain's Chair Knee Raise", type: "isolation" },
  { name: "Plank", type: "isolation" },
  { name: "Pallof Press", type: "isolation" },
  { name: "Russian Twist", type: "isolation" },
  { name: "Ab Wheel Rollout", type: "isolation" },
  { name: "Decline Sit-Up", type: "isolation" },
  { name: "Woodchopper (Cable)", type: "isolation" },
];

/** Normalized key for comparing exercise names across the library and catalog. */
function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Catalog suggestions for a picker query: entries matching `query` that aren't
 * already in the athlete's library. Pure, so the picker's filtering logic is
 * unit-testable without rendering.
 *
 * An empty query returns the first `limit` entries — the catalog is browsable,
 * not search-only.
 */
export function catalogSuggestions(
  query: string,
  libraryNames: Iterable<string>,
  limit = 8
): CatalogEntry[] {
  const taken = new Set([...libraryNames].map(nameKey));
  const q = query.trim().toLowerCase();
  const out: CatalogEntry[] = [];
  for (const entry of EXERCISE_CATALOG) {
    if (out.length >= limit) break;
    if (taken.has(nameKey(entry.name))) continue;
    if (q && !entry.name.toLowerCase().includes(q)) continue;
    out.push(entry);
  }
  return out;
}
