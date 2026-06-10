/** Format a weight without a trailing ".0" (e.g. 60, 57.5). */
export function formatWeight(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1);
}

/** "60 × 10" style set label. */
export function formatSet(weightKg: number, reps: number): string {
  return `${formatWeight(weightKg)} × ${reps}`;
}

/** Localized labels for {@link formatRelativeDay} (a subset of dict.common). */
export type RelDayLabels = {
  today: string;
  yesterday: string;
  daysAgoSuffix: string;
  weeksAgoSuffix: string;
};

/**
 * Short relative day: today / yesterday / "3d ago" / "2w ago" / a date.
 * Labels and the date locale are passed in so the output follows the active
 * UI language (the numeric prefixes stay locale-neutral).
 */
export function formatRelativeDay(
  date: Date,
  labels: RelDayLabels,
  locale: string = "en",
  now = new Date(),
): string {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return labels.today;
  if (days === 1) return labels.yesterday;
  if (days < 7) return `${days}${labels.daysAgoSuffix}`;
  if (days < 28) return `${Math.floor(days / 7)}${labels.weeksAgoSuffix}`;
  return date.toLocaleDateString(locale, { day: "numeric", month: "short" });
}
