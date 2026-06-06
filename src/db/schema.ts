import {
  sqliteTable,
  text,
  integer,
  real,
  unique,
} from "drizzle-orm/sqlite-core";

// Exercise type drives both the rest timer and the weight-increment suggestion.
export type ExerciseType = "compound" | "isolation";

// A training program. Only one is active at a time; switching archives the old
// one (archivedAt set) rather than deleting it, so history stays accessible.
export const programs = sqliteTable("programs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  archivedAt: integer("archived_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// The training days within a program (rest days are simply absent).
// dayOfWeek: 1 = Monday ... 7 = Sunday (ISO).
export const programDays = sqliteTable("program_days", {
  id: text("id").primaryKey(),
  programId: text("program_id")
    .notNull()
    .references(() => programs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  orderIndex: integer("order_index").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Canonical exercise library: one row per distinct movement. Keeping a single
// identity per movement means progression graphs aggregate across every day it
// appears on (e.g. Lateral Raise shows up on both Push and Arms days).
export const exercises = sqliteTable("exercises", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: ["compound", "isolation"] }).notNull(),
  defaultRestSeconds: integer("default_rest_seconds").notNull(),
  // Permanent injury/flag note (e.g. shoulder, lower back, wrist concerns).
  injuryNote: text("injury_note"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// The prescription: which exercises a day contains, in order, with the target
// set count and rep range. Progression targets the top of the rep range.
export const programDayExercises = sqliteTable("program_day_exercises", {
  id: text("id").primaryKey(),
  dayId: text("day_id")
    .notNull()
    .references(() => programDays.id, { onDelete: "cascade" }),
  exerciseId: text("exercise_id")
    .notNull()
    .references(() => exercises.id),
  orderIndex: integer("order_index").notNull(),
  targetSets: integer("target_sets").notNull(),
  repMin: integer("rep_min").notNull(),
  repMax: integer("rep_max").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// A concrete instance of training a given day on a given date.
export const workoutSessions = sqliteTable("workout_sessions", {
  id: text("id").primaryKey(),
  programId: text("program_id")
    .notNull()
    .references(() => programs.id),
  dayId: text("day_id")
    .notNull()
    .references(() => programDays.id),
  performedAt: integer("performed_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  // Training week at the time of the session (drives the deload cadence).
  weekNumber: integer("week_number").notNull(),
  isDeload: integer("is_deload", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Every set logged individually — weight and reps, never an average.
export const setLogs = sqliteTable("set_logs", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => workoutSessions.id, { onDelete: "cascade" }),
  exerciseId: text("exercise_id")
    .notNull()
    .references(() => exercises.id),
  setNumber: integer("set_number").notNull(),
  weightKg: real("weight_kg").notNull(),
  reps: integer("reps").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Per-exercise free-text note within a session ("shoulder felt off").
export const sessionExerciseNotes = sqliteTable(
  "session_exercise_notes",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id),
    note: text("note").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    sessionExerciseUnique: unique().on(table.sessionId, table.exerciseId),
  })
);

// Simple key/value app state — e.g. trainingStartDate (when week counting began).
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Bodyweight measurements — one row per weigh-in. The UI charts the weekly
// average so day-to-day noise (water, food) doesn't drown out the trend.
export const bodyweightLogs = sqliteTable("bodyweight_logs", {
  id: text("id").primaryKey(),
  weightKg: real("weight_kg").notNull(),
  measuredAt: integer("measured_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Progress photos — the image bytes live on disk (see lib/photo-storage); this
// row holds the metadata and is the source of truth for what exists.
export const progressPhotos = sqliteTable("progress_photos", {
  id: text("id").primaryKey(),
  mimeType: text("mime_type").notNull(),
  takenAt: integer("taken_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  note: text("note"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Program = typeof programs.$inferSelect;
export type ProgramDay = typeof programDays.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type ProgramDayExercise = typeof programDayExercises.$inferSelect;
export type WorkoutSession = typeof workoutSessions.$inferSelect;
export type SetLog = typeof setLogs.$inferSelect;
export type SessionExerciseNote = typeof sessionExerciseNotes.$inferSelect;
export type BodyweightLog = typeof bodyweightLogs.$inferSelect;
export type ProgressPhoto = typeof progressPhotos.$inferSelect;
