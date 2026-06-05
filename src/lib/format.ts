/** Format a weight without a trailing ".0" (e.g. 60, 57.5). */
export function formatWeight(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1);
}

/** "60 × 10" style set label. */
export function formatSet(weightKg: number, reps: number): string {
  return `${formatWeight(weightKg)} × ${reps}`;
}

/** Short relative day: today / yesterday / Nd ago / a date. */
export function formatRelativeDay(date: Date, now = new Date()): string {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 28) return `${Math.floor(days / 7)}w ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const WEEKDAY_NAMES = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/** ISO weekday number (1–7) to its English name. */
export function weekdayName(isoWeekday: number): string {
  return WEEKDAY_NAMES[isoWeekday] ?? "";
}
