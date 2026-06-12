import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Sparkles } from "lucide-react";
import { BackButton } from "@/components/nav/back-button";
import { getExerciseHistory } from "@/lib/queries";
import { detectPlateau } from "@/lib/progression";
import { LineChart } from "@/components/charts/line-chart";
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
    <div className="-mx-4 -mt-5 animate-[fadeIn_0.3s_ease] px-[22px] pb-2">
      <header className="-mx-[22px] flex items-center gap-2.5 px-[22px] pt-2 pb-[18px]">
        <BackButton
          label={t.common.back}
          className="-m-1.5 shrink-0 p-1.5 text-muted-foreground"
        />
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate font-display text-[17px] font-bold leading-none tracking-[0.14em] uppercase">
            {exercise.name}
          </h1>
          <p className="mt-1 truncate text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            {t.exerciseTypes[exercise.type]}
            {targetRange &&
              ` · ${targetRange.targetSets} × ${targetRange.repMin}–${targetRange.repMax}`}
          </p>
        </div>
      </header>

      {exercise.injuryNote && (
        <div className="mb-3.5 flex gap-2 rounded-[12px] bg-destructive/10 px-3.5 py-2.5 text-[13px] text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{exercise.injuryNote}</span>
        </div>
      )}

      {plateau.isPlateau && (
        <div className="mb-3.5 flex flex-col gap-3 rounded-[14px] bg-card px-4 py-3.5">
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
            className="inline-flex items-center gap-1.5 self-start rounded-[11px] bg-primary px-3.5 py-2 text-primary-foreground"
          >
            <Sparkles className="size-3.5" />
            <span className="font-display text-[13px] font-semibold tracking-[0.12em] uppercase">
              {t.exercise.askCoach}
            </span>
          </Link>
        </div>
      )}

      <div className="mb-[18px] rounded-[16px] bg-card p-4">
        <p className="mb-2.5 text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          {t.exercise.topSet}
        </p>
        <LineChart data={chartData} />
      </div>

      <h2 className="mb-2 font-semibold text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
        {t.exercise.history}
      </h2>
      {points.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t.exercise.noSessions}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {[...points].reverse().map((p, i) => (
            <li
              key={p.sessionId}
              className="flex items-center justify-between gap-2"
            >
              <span className="text-[13px] text-foreground/75">
                {formatRelativeDay(p.performedAt, t.common, locale)}
              </span>
              <span>
                <span
                  className={`font-display text-[16px] font-semibold tracking-[0.06em] ${
                    i === 0 ? "text-foreground" : "text-foreground/75"
                  }`}
                >
                  {formatSet(p.topWeightKg, p.topReps)}
                </span>
                <span className="text-[12px] text-muted-foreground">
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
