import { db } from "./index";
import {
  programs,
  programDays,
  exercises,
  programDayExercises,
  workoutSessions,
  setLogs,
  sessionExerciseNotes,
  settings,
  type ExerciseType,
} from "./schema";
import { nanoid } from "nanoid";

// Rest defaults by movement type (seconds). Compound lifts need longer rests.
const REST: Record<ExerciseType, number> = { compound: 150, isolation: 75 };

// --- Canonical exercise library -------------------------------------------
// type drives rest + increment; injury notes are this user's known issues.
type ExDef = { name: string; type: ExerciseType; injuryNote?: string };

const EXERCISE_LIBRARY: ExDef[] = [
  // Push
  { name: "Incline DB Press", type: "compound" },
  { name: "Flat DB Press", type: "compound" },
  { name: "Pec Deck / Machine Fly", type: "isolation" },
  { name: "Seated DB Shoulder Press", type: "compound" },
  { name: "Lateral Raise Machine", type: "isolation" },
  { name: "Tricep Rope Pushdown", type: "isolation" },
  { name: "Ab Machine", type: "isolation" },
  // Lower A
  { name: "Barbell Squat", type: "compound" },
  { name: "Leg Extension", type: "isolation" },
  {
    name: "Leg Curl",
    type: "isolation",
    injuryNote:
      "Reintroduce gradually at low weight — lower back pain history. Stop if the lower back rounds or pinches.",
  },
  { name: "Standing Calf Raise", type: "isolation" },
  { name: "Hanging Leg Raise", type: "isolation" },
  // Pull
  { name: "Pull-Ups or Lat Pulldown", type: "compound" },
  { name: "Landmine Row (narrow grip)", type: "compound" },
  { name: "Horizontal Cable Row", type: "compound" },
  {
    name: "Rear Delt Fly (Machine/Cable)",
    type: "isolation",
    injuryNote:
      "Right shoulder sharp pain on the cable version — prefer the machine / Reverse Pec Deck.",
  },
  { name: "Face Pulls", type: "isolation" },
  { name: "Smith Machine Bicep Curl", type: "isolation" },
  { name: "Hammer Curl (DB)", type: "isolation" },
  // Lower B
  { name: "Leg Press", type: "compound" },
  { name: "Romanian Deadlift", type: "compound" },
  { name: "Hip Thrust", type: "compound" },
  { name: "Hip Abduction Machine", type: "isolation" },
  { name: "Seated Calf Raise", type: "isolation" },
  // Arms & Shoulders
  { name: "Reverse Pec Deck", type: "isolation" },
  { name: "Tricep Overhead Extension", type: "isolation" },
  { name: "Cable Curl (standing, single arm)", type: "isolation" },
  // Not in the active program, but seeded with its flag so it's ready if added.
  {
    name: "Dips",
    type: "compound",
    injuryNote:
      "Avoid heavy — right shoulder. Reintroduce with assisted weight when ready.",
  },
];

// --- Program structure -----------------------------------------------------
// [exerciseName, targetSets, repMin, repMax]
type Prescription = [string, number, number, number];

const PROGRAM_DAYS: {
  name: string;
  dayOfWeek: number;
  exercises: Prescription[];
}[] = [
  {
    name: "Upper Push",
    dayOfWeek: 1,
    exercises: [
      ["Incline DB Press", 4, 8, 10],
      ["Flat DB Press", 3, 10, 12],
      ["Pec Deck / Machine Fly", 3, 12, 15],
      ["Seated DB Shoulder Press", 4, 8, 10],
      ["Lateral Raise Machine", 3, 15, 20],
      ["Tricep Rope Pushdown", 3, 12, 15],
      ["Ab Machine", 3, 15, 20],
    ],
  },
  {
    name: "Lower A (Quad Focus)",
    dayOfWeek: 2,
    exercises: [
      ["Barbell Squat", 4, 6, 8],
      ["Leg Extension", 3, 12, 15],
      ["Leg Curl", 3, 12, 15],
      ["Standing Calf Raise", 4, 15, 20],
      ["Hanging Leg Raise", 3, 12, 15],
    ],
  },
  {
    name: "Upper Pull",
    dayOfWeek: 4,
    exercises: [
      ["Pull-Ups or Lat Pulldown", 4, 8, 10],
      ["Landmine Row (narrow grip)", 4, 8, 10],
      ["Horizontal Cable Row", 3, 10, 12],
      ["Rear Delt Fly (Machine/Cable)", 4, 15, 20],
      ["Face Pulls", 3, 15, 20],
      ["Smith Machine Bicep Curl", 3, 10, 12],
      ["Hammer Curl (DB)", 3, 10, 12],
    ],
  },
  {
    name: "Lower B (Posterior Chain & Glutes)",
    dayOfWeek: 5,
    exercises: [
      ["Leg Press", 3, 12, 15],
      ["Romanian Deadlift", 3, 10, 12],
      ["Hip Thrust", 3, 12, 15],
      ["Hip Abduction Machine", 3, 15, 20],
      ["Seated Calf Raise", 4, 15, 20],
    ],
  },
  {
    name: "Arms & Shoulders",
    dayOfWeek: 6,
    exercises: [
      ["Seated DB Shoulder Press", 3, 10, 12],
      ["Lateral Raise Machine", 4, 15, 20],
      ["Reverse Pec Deck", 3, 15, 20],
      ["Tricep Overhead Extension", 3, 12, 15],
      ["Tricep Rope Pushdown", 3, 12, 15],
      ["Smith Machine Bicep Curl", 3, 10, 12],
      ["Cable Curl (standing, single arm)", 3, 10, 12],
      ["Ab Machine", 3, 15, 20],
    ],
  },
];

async function seed() {
  console.log("Seeding database...");

  // Clear existing data (children first in case foreign keys are enforced).
  await db.delete(sessionExerciseNotes);
  await db.delete(setLogs);
  await db.delete(workoutSessions);
  await db.delete(programDayExercises);
  await db.delete(programDays);
  await db.delete(exercises);
  await db.delete(programs);
  await db.delete(settings);

  // Exercise library — keep a name -> id map for wiring up prescriptions.
  const exerciseIdByName = new Map<string, string>();
  await db.insert(exercises).values(
    EXERCISE_LIBRARY.map((ex) => {
      const id = nanoid();
      exerciseIdByName.set(ex.name, id);
      return {
        id,
        name: ex.name,
        type: ex.type,
        defaultRestSeconds: REST[ex.type],
        injuryNote: ex.injuryNote ?? null,
      };
    })
  );

  // Active program.
  const programId = nanoid();
  await db.insert(programs).values({
    id: programId,
    name: "Aesthetic 5-Day Split",
    isActive: true,
  });

  // Days + prescriptions.
  for (let d = 0; d < PROGRAM_DAYS.length; d++) {
    const day = PROGRAM_DAYS[d];
    const dayId = nanoid();
    await db.insert(programDays).values({
      id: dayId,
      programId,
      name: day.name,
      dayOfWeek: day.dayOfWeek,
      orderIndex: d,
    });

    await db.insert(programDayExercises).values(
      day.exercises.map(([name, sets, repMin, repMax], i) => {
        const exerciseId = exerciseIdByName.get(name);
        if (!exerciseId) throw new Error(`Unknown exercise in seed: ${name}`);
        return {
          id: nanoid(),
          dayId,
          exerciseId,
          orderIndex: i,
          targetSets: sets,
          repMin,
          repMax,
        };
      })
    );
  }

  console.log(
    `Seed complete: 1 program, ${PROGRAM_DAYS.length} training days, ${EXERCISE_LIBRARY.length} exercises.`
  );
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
