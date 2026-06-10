"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { logBodyweightAction, deleteBodyweightAction } from "@/app/actions";
import { formatWeight, formatRelativeDay } from "@/lib/format";
import { useT, useLocale } from "@/components/i18n/i18n-provider";
import type { BodyweightLog } from "@/db/schema";

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function BodyweightTracker({ entries }: { entries: BodyweightLog[] }) {
  const t = useT();
  const locale = useLocale();
  const latest = entries.at(-1);
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(todayStr());
  const [pending, startTransition] = useTransition();

  // entries arrive oldest-first; show the most recent for review/correction.
  const recent = [...entries].reverse().slice(0, 14);

  const log = () => {
    const w = parseFloat(weight);
    if (!Number.isFinite(w) || w <= 0 || pending) return;
    const [y, m, d] = date.split("-").map(Number);
    const measuredAt = new Date(y, m - 1, d, 12, 0, 0).toISOString();
    startTransition(async () => {
      await logBodyweightAction({ weightKg: Math.round(w * 10) / 10, measuredAt });
      setWeight("");
      setDate(todayStr());
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            log();
          }}
          className="flex items-end gap-2"
        >
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              {t.bodyweight.weightKg}
            </span>
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder={
                latest ? formatWeight(latest.weightKg) : t.bodyweight.weightPlaceholder
              }
              className="h-11"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              {t.bodyweight.date}
            </span>
            <Input
              type="date"
              value={date}
              max={todayStr()}
              onChange={(e) => setDate(e.target.value)}
              className="h-11"
            />
          </label>
          <Button
            type="submit"
            disabled={pending || !weight.trim()}
            className="h-11 gap-1"
          >
            <Plus className="size-4" />
            {t.bodyweight.log}
          </Button>
        </form>
      </Card>

      {recent.length > 0 && (
        <div>
          <h2 className="mb-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t.bodyweight.recent}
          </h2>
          <ul className="flex flex-col gap-2">
            {recent.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between rounded-xl bg-card p-3 text-sm ring-1 ring-foreground/10"
              >
                <span className="text-muted-foreground">
                  {formatRelativeDay(e.measuredAt, t.common, locale)}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-medium tabular-nums">
                    {formatWeight(e.weightKg)} kg
                  </span>
                  <button
                    type="button"
                    aria-label={t.bodyweight.deleteEntry}
                    onClick={() =>
                      startTransition(() => void deleteBodyweightAction({ id: e.id }))
                    }
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
