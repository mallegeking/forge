import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { getBodyweightEntries } from "@/lib/queries";
import { weeklyAverages, bodyweightTrend } from "@/lib/bodyweight";
import { LineChart } from "@/components/charts/line-chart";
import { Card } from "@/components/ui/card";
import { formatWeight } from "@/lib/format";
import { BodyweightTracker } from "@/components/bodyweight/bodyweight-tracker";

export const metadata: Metadata = { title: "Bodyweight · Forge" };

// Reads the database directly — render per request, not prerendered at build.
export const dynamic = "force-dynamic";

export default async function BodyweightPage() {
  const entries = await getBodyweightEntries();
  const weekly = weeklyAverages(
    entries.map((e) => ({ weightKg: e.weightKg, measuredAt: e.measuredAt }))
  );
  const trend = bodyweightTrend(weekly);
  const latest = entries.at(-1) ?? null;
  const chartData = weekly.map((w) => ({ label: w.label, value: w.avgWeightKg }));

  const TrendIcon = trend == null || trend === 0 ? Minus : trend < 0 ? TrendingDown : TrendingUp;

  return (
    <div>
      <header className="mb-4 flex items-center gap-2">
        <Link
          href="/"
          aria-label="Back"
          className="-ml-2 flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            Bodyweight
          </h1>
          <p className="text-xs text-muted-foreground">Weekly average &amp; trend</p>
        </div>
      </header>

      <Card className="mb-4 p-4">
        {latest ? (
          <div className="flex items-end justify-between">
            <div>
              <span className="text-xs text-muted-foreground">Latest</span>
              <p className="text-2xl font-semibold tracking-tight tabular-nums">
                {formatWeight(latest.weightKg)}{" "}
                <span className="text-base font-normal text-muted-foreground">
                  kg
                </span>
              </p>
            </div>
            {trend != null && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground tabular-nums">
                <TrendIcon className="size-4" />
                {trend > 0 ? "+" : ""}
                {formatWeight(trend)} kg · {weekly.length} wks
              </span>
            )}
          </div>
        ) : (
          <p className="py-2 text-center text-sm text-muted-foreground">
            Log your first weigh-in below to start tracking.
          </p>
        )}
      </Card>

      {weekly.length > 0 && (
        <Card className="mb-4 py-4">
          <div className="px-4">
            <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Weekly average
            </p>
            <LineChart
              data={chartData}
              ariaLabel="Bodyweight weekly average over time"
            />
          </div>
        </Card>
      )}

      <BodyweightTracker entries={entries} />
    </div>
  );
}
