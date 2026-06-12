import Link from "next/link";
import type { Metadata } from "next";
import { Utensils, Scale } from "lucide-react";
import { getNutritionConfig } from "@/lib/nutrition-config";
import { goalAdjustment } from "@/lib/nutrition";
import { formatWeight } from "@/lib/format";
import { getDict } from "@/lib/i18n/server";
import { GoalSwitcher } from "@/components/nutrition/goal-switcher";
import { NutritionSettingsForm } from "@/components/nutrition/nutrition-settings-form";
import { NutritionRecommendations } from "@/components/nutrition/nutrition-recommendations";

export const metadata: Metadata = { title: "Fuel · Forge" };

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
    <div className="-mx-4 -mt-5 animate-[fadeIn_0.3s_ease] px-[22px] pb-2">
      {/* Header */}
      <header className="-mx-[22px] flex items-center justify-between px-[22px] pt-2">
        <div className="flex items-center gap-2">
          <Utensils className="size-4 text-primary" strokeWidth={2.2} />
          <span className="font-display text-xl font-bold tracking-[0.18em] uppercase">
            {t.tabs.fuel}
          </span>
        </div>
        {latestWeightKg != null && (
          <span className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            {t.nutrition.basedOn} {formatWeight(latestWeightKg)}{" "}
            {t.session.kg.toUpperCase()}
          </span>
        )}
      </header>

      {targets && latestWeightKg != null ? (
        <>
          {/* Target cards */}
          <section className="grid grid-cols-2 gap-2.5 pt-6">
            <TargetCard
              label={t.nutrition.calories}
              value={targets.calories.toLocaleString()}
              caption={t.nutrition.kcalPerDay}
            />
            <TargetCard
              label={t.nutrition.protein}
              value={String(targets.proteinG)}
              caption={`${t.nutrition.gPerDay} · ${
                Math.round((targets.proteinG / latestWeightKg) * 10) / 10
              } ${t.nutrition.gPerKg}`}
            />
          </section>

          {/* Derivation — the honest framing */}
          <section className="mt-3.5 flex flex-col gap-2 rounded-[14px] bg-card px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] text-muted-foreground">
                {t.nutrition.maintenance} (
                {t.nutrition.activityLabels[config.activity].toLowerCase()})
              </span>
              <span className="font-display text-[15px] font-semibold tracking-[0.06em]">
                ≈ {targets.maintenance.toLocaleString()}{" "}
                {t.nutrition.kcal.toUpperCase()}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] text-muted-foreground">
                {t.nutrition.goalAdjustment} · {goalLabel}
              </span>
              <span
                className={`font-display text-[15px] font-semibold tracking-[0.06em] ${
                  goal.kcalDelta !== 0 ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {goal.kcalDelta > 0 ? "+" : ""}
                {goal.kcalDelta} {t.nutrition.kcal.toUpperCase()}
              </span>
            </div>
            {targets.source === "override" && (
              <p className="border-t border-border pt-2 text-[11px] text-muted-foreground">
                {t.nutrition.manualOverride}
                {t.nutrition.autoComputedHint}
              </p>
            )}
          </section>

          {/* Goal switcher */}
          <section className="mt-[18px]">
            <span className="font-semibold text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
              {t.nutrition.goalLabel}
            </span>
            <GoalSwitcher config={config} />
          </section>

          {/* Full settings (activity, overrides, preferences) */}
          <div className="mt-4">
            <NutritionSettingsForm current={config} />
          </div>
        </>
      ) : (
        <section className="mt-6 flex flex-col items-center gap-3 rounded-[16px] bg-card p-6 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-foreground/[0.07] text-muted-foreground">
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
            className="inline-flex items-center gap-1.5 rounded-[11px] bg-primary px-3.5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            <Scale className="size-4" />
            {t.nutrition.logBodyweight}
          </Link>
        </section>
      )}

      {/* Grocery recommendations (header + refresh live in the component) */}
      <div className="mt-5">
        <NutritionRecommendations />
      </div>
    </div>
  );
}

function TargetCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-[16px] bg-card px-4 py-[18px]">
      <span className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </span>
      <div className="mt-2 font-display text-[44px] font-bold leading-[0.95]">
        {value}
      </div>
      <span className="text-[11px] text-muted-foreground">{caption}</span>
    </div>
  );
}
