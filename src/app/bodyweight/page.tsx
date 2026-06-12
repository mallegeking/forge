import type { Metadata } from "next";
import Link from "next/link";
import { Scale, Camera } from "lucide-react";
import { getBodyweightEntries } from "@/lib/queries";
import { weeklyAverages, bodyweightTrend } from "@/lib/bodyweight";
import { BodyweightChart } from "@/components/charts/bodyweight-chart";
import { formatWeight } from "@/lib/format";
import { getDict } from "@/lib/i18n/server";
import { BodyweightTracker } from "@/components/bodyweight/bodyweight-tracker";

export const metadata: Metadata = { title: "Body · Forge" };

// Reads the database directly — render per request, not prerendered at build.
export const dynamic = "force-dynamic";

export default async function BodyweightPage() {
  const [entries, t] = await Promise.all([getBodyweightEntries(), getDict()]);
  const weekly = weeklyAverages(
    entries.map((e) => ({ weightKg: e.weightKg, measuredAt: e.measuredAt }))
  );
  const trend = bodyweightTrend(weekly);
  const latest = entries.at(-1) ?? null;

  return (
    <div className="-mx-4 -mt-5 animate-[fadeIn_0.3s_ease] pb-2">
      {/* Header */}
      <header className="flex items-center justify-between px-[22px] pt-2">
        <div className="flex items-center gap-2">
          <Scale className="size-4 text-primary" strokeWidth={2.2} />
          <span className="font-display text-xl font-bold tracking-[0.18em] uppercase">
            {t.tabs.body}
          </span>
        </div>
        <div className="flex items-center gap-3.5">
          <span className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            {weekly.length}{" "}
            {weekly.length === 1
              ? t.bodyweight.weekTracked
              : t.bodyweight.weeksTracked}
          </span>
          <Link
            href="/photos"
            aria-label={t.home.photosTitle}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <Camera className="size-[17px]" strokeWidth={2.2} />
          </Link>
        </div>
      </header>

      {latest ? (
        <>
          {/* Hero: latest weight + trend over the tracked weeks */}
          <section className="flex items-end justify-between px-[22px] pt-[26px]">
            <div>
              <span className="font-semibold text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
                {t.bodyweight.latest}
              </span>
              <div className="mt-1 font-display text-[72px] font-bold leading-[0.9]">
                {formatWeight(latest.weightKg)}
                <span className="text-[28px] text-muted-foreground"> kg</span>
              </div>
            </div>
            {trend != null && (
              <div className="flex flex-col items-end gap-1 pb-1.5">
                <span
                  className={`font-display text-[22px] font-semibold ${
                    trend <= 0 ? "text-success" : "text-foreground"
                  }`}
                >
                  {trend > 0 ? "+" : trend < 0 ? "−" : "±"}
                  {formatWeight(Math.abs(trend))} {t.session.kg.toUpperCase()}
                </span>
                <span className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  {t.bodyweight.over} {weekly.length}{" "}
                  {weekly.length === 1
                    ? t.bodyweight.weekWord
                    : t.bodyweight.weeksWord}
                </span>
              </div>
            )}
          </section>

          {/* Weekly-average chart */}
          {weekly.length > 0 && (
            <section className="mx-[22px] mt-[22px] rounded-[16px] bg-card p-4">
              <span className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                {t.bodyweight.weeklyAverage}
              </span>
              <BodyweightChart
                points={weekly.map((w) => ({ value: w.avgWeightKg }))}
              />
            </section>
          )}
        </>
      ) : (
        <p className="px-[22px] py-16 text-center text-sm text-muted-foreground">
          {t.bodyweight.empty}
        </p>
      )}

      <BodyweightTracker entries={entries} />
    </div>
  );
}
