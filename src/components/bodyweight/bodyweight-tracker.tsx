"use client";

import { useState, useTransition } from "react";
import { CalendarDays, Minus, Plus, Trash2 } from "lucide-react";
import { logBodyweightAction, deleteBodyweightAction } from "@/app/actions";
import { formatWeight, formatRelativeDay } from "@/lib/format";
import { useT, useLocale } from "@/components/i18n/i18n-provider";
import type { BodyweightLog } from "@/db/schema";

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// The Ember Body screen's interactive half: the recent raw entries (daily
// noise stays visible but secondary) and the thumb-reach quick-log stepper.
// The calendar toggle reveals a date field for backdating a missed weigh-in.
export function BodyweightTracker({ entries }: { entries: BodyweightLog[] }) {
  const t = useT();
  const locale = useLocale();
  const latest = entries.at(-1);
  const [value, setValue] = useState(() => latest?.weightKg ?? 80);
  const [dateOpen, setDateOpen] = useState(false);
  const [date, setDate] = useState(todayStr());
  const [pending, startTransition] = useTransition();

  // entries arrive oldest-first; show the most recent for review/correction.
  const recent = [...entries].reverse().slice(0, 14);

  const step = (delta: number) =>
    setValue((v) => Math.max(0, Math.round((v + delta) * 10) / 10));

  const backdated = date !== todayStr();

  const log = () => {
    if (pending || value <= 0) return;
    // Backdated weigh-ins land at noon of the chosen day (same convention the
    // old form used); today's go in with the real timestamp.
    let measuredAt: string | undefined;
    if (backdated) {
      const [y, m, d] = date.split("-").map(Number);
      measuredAt = new Date(y, m - 1, d, 12, 0, 0).toISOString();
    }
    startTransition(async () => {
      await logBodyweightAction({ weightKg: value, measuredAt });
      setDate(todayStr());
      setDateOpen(false);
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
      <div className="sticky bottom-[88px] mt-6 flex flex-col gap-2 px-[22px]">
        {dateOpen && (
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            aria-label={t.bodyweight.date}
            className="h-11 rounded-[12px] bg-card px-3.5 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        )}
        <div className="flex gap-2.5">
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
            aria-label={t.bodyweight.date}
            aria-pressed={dateOpen}
            onClick={() => {
              setDateOpen((v) => !v);
              if (dateOpen) setDate(todayStr());
            }}
            className={`flex w-12 items-center justify-center rounded-[14px] bg-card ${
              backdated ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <CalendarDays className="size-[18px]" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={log}
            disabled={pending}
            className="w-[96px] rounded-[14px] bg-primary text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            <span className="font-display text-[17px] font-semibold tracking-[0.14em] uppercase">
              {t.bodyweight.log}
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
