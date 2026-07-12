"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

// Deduplicated personal-record card: one row per exercise (its all-time best),
// freshest first. Six rows by default; the toggle reveals the rest. Values and
// dates arrive pre-formatted from the server page so locale logic stays there.
export type PrListItem = {
  exerciseId: string;
  name: string;
  /** "+5 kg × 8" style best-set label. */
  value: string;
  /** Relative day label ("2d ago"). */
  day: string;
};

const VISIBLE = 6;

export function PrList({
  items,
  labels,
}: {
  items: PrListItem[];
  labels: { title: string; empty: string; showAll: string; showLess: string };
}) {
  const [expanded, setExpanded] = useState(false);
  // No toggle that reveals a single row — just show 7 then.
  const collapsible = items.length > VISIBLE + 1;
  const visible = expanded || !collapsible ? items : items.slice(0, VISIBLE);

  return (
    <section className="rounded-[16px] bg-card p-4">
      <p className="mb-2.5 text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
        {labels.title}
      </p>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {labels.empty}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {visible.map((it) => (
              <li
                key={it.exerciseId}
                className="flex items-center justify-between gap-2"
              >
                <span className="min-w-0 truncate text-[13px] text-foreground/75">
                  {it.name}
                </span>
                <span className="shrink-0">
                  <span className="font-display text-[14px] font-semibold tracking-[0.06em] text-success">
                    {it.value}
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    {" "}
                    · {it.day}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {collapsible && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-3 flex w-full items-center justify-center gap-1 rounded-[10px] bg-muted py-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase transition-colors active:bg-muted/70"
            >
              {expanded ? (
                <>
                  {labels.showLess}
                  <ChevronUp className="size-3.5" />
                </>
              ) : (
                <>
                  {labels.showAll.replace("{n}", String(items.length))}
                  <ChevronDown className="size-3.5" />
                </>
              )}
            </button>
          )}
        </>
      )}
    </section>
  );
}
