import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Sparkles } from "lucide-react";
import { BackButton } from "@/components/nav/back-button";
import { getExerciseHistory } from "@/lib/queries";
import { detectPlateau } from "@/lib/progression";
import { LineChart } from "@/components/charts/line-chart";
import { Card } from "@/components/ui/card";
import { formatSet, formatWeight, formatRelativeDay } from "@/lib/format";
import { getDict, getLocale } from "@/lib/i18n/server";

export default async function ExercisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, locale] = await Promise.all([getDict(), getLocale()]);
  const history = await getExerciseHistory(id);
  if (!history) notFound();

  const { exercise, targetRange, points } = history;
  const chartData = points.map((p) => ({
    label: p.performedAt.toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
    }),
    value: p.topWeightKg,
  }));

  // Plateau detection runs over most-recent-first session summaries.
  const plateau = detectPlateau(
    [...points]
      .reverse()
      .map((p) => ({ weightKg: p.topWeightKg, hitTopOfRange: p.hitTopOfRange }))
  );
  const stuckWeight = plateau.weightKg ?? 0;
  const askCoach = `${t.exercise.askCoachPrompt1} ${exercise.name} ${t.exercise.askCoachPrompt2} ${formatWeight(
    stuckWeight
  )}${t.exercise.askCoachPrompt3} ${plateau.consecutive} ${t.exercise.askCoachPrompt4}`;

  return (
    <div>
      <header className="mb-4 flex items-center gap-2">
        <BackButton
          label={t.common.back}
          className="-ml-2 flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {exercise.name}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t.exerciseTypes[exercise.type]}
            {targetRange &&
              ` · ${targetRange.targetSets} × ${targetRange.repMin}–${targetRange.repMax}`}
          </p>
        </div>
      </header>

      {exercise.injuryNote && (
        <div className="mb-4 flex gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{exercise.injuryNote}</span>
        </div>
      )}

      {plateau.isPlateau && (
        <Card className="mb-4 gap-3 p-4">
          <div className="flex items-start gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-500">
              <AlertTriangle className="size-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">
                {t.exercise.plateauTitle1} {plateau.consecutive}{" "}
                {t.exercise.plateauTitle2}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t.exercise.plateauBody1} {formatWeight(stuckWeight)}kg ·{" "}
                {plateau.consecutive} {t.exercise.plateauSessions}{" "}
                {t.exercise.plateauBody2}
              </p>
            </div>
          </div>
          <ul className="ml-0.5 flex flex-col gap-1 text-xs text-muted-foreground">
            {t.exercise.strategies.map((s, i) => (
              <li key={i}>• {s}</li>
            ))}
          </ul>
          <Link
            href={`/coach?ask=${encodeURIComponent(askCoach)}`}
            className="inline-flex items-center gap-1.5 self-start rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/80"
          >
            <Sparkles className="size-3.5" />
            {t.exercise.askCoach}
          </Link>
        </Card>
      )}

      <Card className="mb-4 py-4">
        <div className="px-4">
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t.exercise.topSet}
          </p>
          <LineChart data={chartData} />
        </div>
      </Card>

      <h2 className="mb-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t.exercise.history}
      </h2>
      {points.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t.exercise.noSessions}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {[...points].reverse().map((p) => (
            <li
              key={p.sessionId}
              className="flex items-center justify-between rounded-xl bg-card p-3 text-sm ring-1 ring-foreground/10"
            >
              <span className="text-muted-foreground">
                {formatRelativeDay(p.performedAt, t.common, locale)}
              </span>
              <span className="tabular-nums">
                <span className="font-medium">
                  {formatSet(p.topWeightKg, p.topReps)}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  · {p.totalSets}{" "}
                  {p.totalSets === 1 ? t.exercise.setSingular : t.exercise.setPlural}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
