import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, Flame, Beef, Scale } from "lucide-react";
import { getNutritionConfig } from "@/lib/nutrition-config";
import { goalAdjustment } from "@/lib/nutrition";
import { getDict } from "@/lib/i18n/server";
import { Card } from "@/components/ui/card";
import { NutritionSettingsForm } from "@/components/nutrition/nutrition-settings-form";
import { NutritionRecommendations } from "@/components/nutrition/nutrition-recommendations";

export const metadata: Metadata = { title: "Nutrition · Forge" };

// Reads the database directly — render per request, not prerendered at build.
export const dynamic = "force-dynamic";

export default async function NutritionPage() {
  const [{ config, latestWeightKg, targets }, t] = await Promise.all([
    getNutritionConfig(),
    getDict(),
  ]);
  const goal = goalAdjustment(config.goal);
  const goalLabel = t.nutrition.goalLabels[config.goal];

  return (
    <div>
      <header className="mb-4 flex items-center gap-2">
        <Link
          href="/"
          aria-label={t.common.back}
          className="-ml-2 flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {t.nutrition.title}
          </h1>
          <p className="text-xs text-muted-foreground">{t.nutrition.subtitle}</p>
        </div>
      </header>

      {targets && latestWeightKg != null ? (
        <Card className="mb-4 p-4">
          <div className="flex items-stretch justify-between gap-3">
            <div className="flex-1">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Flame className="size-3.5" /> {t.nutrition.calories}
              </span>
              <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums">
                {targets.calories.toLocaleString()}
                <span className="ml-1 text-base font-normal text-muted-foreground">
                  {t.nutrition.kcal}
                </span>
              </p>
            </div>
            <div className="w-px bg-foreground/10" />
            <div className="flex-1">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Beef className="size-3.5" /> {t.nutrition.protein}
              </span>
              <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums">
                {targets.proteinG}
                <span className="ml-1 text-base font-normal text-muted-foreground">
                  {t.nutrition.grams}
                </span>
              </p>
            </div>
          </div>
          <p className="mt-3 border-t border-foreground/10 pt-3 text-xs text-muted-foreground">
            {targets.source === "override" ? t.nutrition.manualOverride : ""}
            {t.nutrition.maintenanceApprox}{" "}
            {targets.maintenance.toLocaleString()} {t.nutrition.kcal} ·{" "}
            {t.nutrition.goal} {goalLabel}
            {goal.kcalDelta !== 0
              ? ` (${goal.kcalDelta > 0 ? "+" : ""}${goal.kcalDelta})`
              : ""}{" "}
            · {t.nutrition.basedOn} {latestWeightKg} kg (
            {t.nutrition.activityLabels[config.activity]})
          </p>
        </Card>
      ) : (
        <Card className="mb-4 flex flex-col items-center gap-3 p-6 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Scale className="size-5" />
          </div>
          <div>
            <h2 className="font-medium">{t.nutrition.noTargetsTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.nutrition.noTargetsBody}
            </p>
          </div>
          <Link
            href="/bodyweight"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
          >
            <Scale className="size-4" />
            {t.nutrition.logBodyweight}
          </Link>
        </Card>
      )}

      <div className="mb-5">
        <NutritionSettingsForm current={config} />
      </div>

      <h2 className="mb-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t.nutrition.groceryHeading}
      </h2>
      <NutritionRecommendations />
    </div>
  );
}
