"use client";

import { useState } from "react";
import { LineChart } from "@/components/charts/line-chart";
import { useT, useLocale } from "@/components/i18n/i18n-provider";

// Estimated-1RM trends, one series per exercise. The picker lets you switch
// which lift the chart draws; the list arrives sorted most-trained first, so
// the default selection is the exercise you have the most data for.
type Series = {
  exerciseId: string;
  name: string;
  points: { performedAt: string | Date; e1rm: number }[];
};

export function Stats1RmCard({ series }: { series: Series[] }) {
  const t = useT();
  const locale = useLocale();
  const [selectedId, setSelectedId] = useState(series[0]?.exerciseId ?? "");

  if (series.length === 0) {
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

  const current = series.find((s) => s.exerciseId === selectedId) ?? series[0];
  const data = current.points.map((p) => ({
    label: new Date(p.performedAt).toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
    }),
    value: p.e1rm,
  }));

  return (
    <div className="rounded-[16px] bg-card p-4">
      <p className="mb-2.5 text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
        {t.statistics.e1rm}
      </p>

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {series.map((s) => {
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

      <LineChart data={data} ariaLabel={t.statistics.e1rm} />
    </div>
  );
}
