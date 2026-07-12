"use client";

import { useState } from "react";
import { LineChart } from "@/components/charts/line-chart";
import { useT, useLocale } from "@/components/i18n/i18n-provider";
import { formatWeight } from "@/lib/format";

// Estimated-1RM trends, one series per exercise. The picker lets you switch
// which lift the chart draws; the list arrives sorted most-trained first, so
// the default selection is the exercise you have the most data for. Only the
// six best-tracked lifts get a pill — beyond that the data is too thin to
// chart anyway.
type Series = {
  exerciseId: string;
  name: string;
  points: { performedAt: string | Date; e1rm: number }[];
};

const MAX_PILLS = 6;

export function Stats1RmCard({ series }: { series: Series[] }) {
  const t = useT();
  const locale = useLocale();
  const shown = series.slice(0, MAX_PILLS);
  const [selectedId, setSelectedId] = useState(shown[0]?.exerciseId ?? "");

  if (shown.length === 0) {
    return (
      <div className="rounded-[16px] bg-card p-4">
        <p className="mb-2.5 text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          {t.statistics.e1rm}
        </p>
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t.statistics.noData}
        </p>
      </div>
    );
  }

  const current = shown.find((s) => s.exerciseId === selectedId) ?? shown[0];
  const data = current.points.map((p) => ({
    label: new Date(p.performedAt).toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
    }),
    value: p.e1rm,
  }));
  const latest = current.points[current.points.length - 1];

  return (
    <div className="rounded-[16px] bg-card p-4">
      <p className="mb-2.5 text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
        {t.statistics.e1rm}
      </p>

      {/* Right-edge fade hints that the pill row scrolls instead of clipping. */}
      <div className="relative mb-3">
        <div className="flex gap-2 overflow-x-auto pb-1 pr-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {shown.map((s) => {
            const active = s.exerciseId === current.exerciseId;
            return (
              <button
                key={s.exerciseId}
                type="button"
                onClick={() => setSelectedId(s.exerciseId)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-[0.06em] uppercase transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s.name}
              </button>
            );
          })}
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent" />
      </div>

      {latest && (
        <div className="mb-1 flex items-baseline gap-1.5">
          <span className="font-display text-[24px] font-bold leading-none">
            {formatWeight(latest.e1rm)} {t.session.kg}
          </span>
          <span className="text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
            {t.statistics.currentE1rm}
          </span>
        </div>
      )}

      <LineChart data={data} ariaLabel={t.statistics.e1rm} />
    </div>
  );
}
