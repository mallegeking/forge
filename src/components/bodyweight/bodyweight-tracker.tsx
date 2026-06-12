"use client";

import { useState, useTransition } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { logBodyweightAction, deleteBodyweightAction } from "@/app/actions";
import { formatWeight, formatRelativeDay } from "@/lib/format";
import { useT, useLocale } from "@/components/i18n/i18n-provider";
import type { BodyweightLog } from "@/db/schema";

// The Ember Body screen's interactive half: the recent raw entries (daily
// noise stays visible but secondary) and the thumb-reach quick-log stepper.
export function BodyweightTracker({ entries }: { entries: BodyweightLog[] }) {
  const t = useT();
  const locale = useLocale();
  const latest = entries.at(-1);
  const [value, setValue] = useState(() => latest?.weightKg ?? 80);
  const [pending, startTransition] = useTransition();

  // entries arrive oldest-first; show the most recent for review/correction.
  const recent = [...entries].reverse().slice(0, 14);

  const step = (delta: number) =>
    setValue((v) => Math.max(0, Math.round((v + delta) * 10) / 10));

  const log = () => {
    if (pending || value <= 0) return;
    startTransition(async () => {
      await logBodyweightAction({ weightKg: value });
    });
  };

  return (
    <>
      {/* Recent raw entries */}
      {recent.length > 0 && (
        <section className="mt-[18px] flex flex-col gap-2 px-[22px]">
          <span className="font-semibold text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
            {t.bodyweight.recent}
          </span>
          {recent.map((e, i) => (
            <div key={e.id} className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-foreground/75">
                {formatRelativeDay(e.measuredAt, t.common, locale)} ·{" "}
                {e.measuredAt.toLocaleTimeString(locale, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className={`font-display text-[16px] font-semibold tracking-[0.06em] ${
                    i === 0 ? "text-foreground" : "text-foreground/75"
                  }`}
                >
                  {formatWeight(e.weightKg)} {t.session.kg.toUpperCase()}
                </span>
                <button
                  type="button"
                  aria-label={t.bodyweight.deleteEntry}
                  onClick={() =>
                    startTransition(
                      () => void deleteBodyweightAction({ id: e.id })
                    )
                  }
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            </div>
          ))}
        </section>
      )}

      {/* Quick log — pinned in thumb reach above the tab bar */}
      <div className="sticky bottom-[88px] mt-6 flex gap-2.5 px-[22px]">
        <div className="flex flex-1 items-center justify-between rounded-[14px] bg-card p-2">
          <button
            type="button"
            aria-label={`${t.session.decrease} ${t.session.kg}`}
            onClick={() => step(-0.1)}
            className="flex size-11 items-center justify-center rounded-[11px] bg-foreground/[0.07] active:bg-foreground/[0.16]"
          >
            <Minus className="size-[15px]" strokeWidth={2.4} />
          </button>
          <span className="font-display text-[26px] font-bold tabular-nums">
            {value.toFixed(1)}
          </span>
          <button
            type="button"
            aria-label={`${t.session.increase} ${t.session.kg}`}
            onClick={() => step(0.1)}
            className="flex size-11 items-center justify-center rounded-[11px] bg-foreground/[0.07] active:bg-foreground/[0.16]"
          >
            <Plus className="size-[15px]" strokeWidth={2.4} />
          </button>
        </div>
        <button
          type="button"
          onClick={log}
          disabled={pending}
          className="w-[110px] rounded-[14px] bg-primary text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          <span className="font-display text-[17px] font-semibold tracking-[0.14em] uppercase">
            {t.bodyweight.log}
          </span>
        </button>
      </div>
    </>
  );
}
