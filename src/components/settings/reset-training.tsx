"use client";

import { useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { resetTrainingProgressAction } from "@/app/actions";
import { useT } from "@/components/i18n/i18n-provider";

// Restart the program clock at week 1. Non-destructive (sessions and weights
// survive), but it changes the deload cadence — hence the confirm.
export function ResetTraining() {
  const t = useT();
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <p className="mb-2.5 text-xs text-muted-foreground">
        {t.settings.resetHint}
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t.settings.resetConfirm)) return;
          startTransition(async () => {
            await resetTrainingProgressAction();
          });
        }}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-[12px] border border-input text-foreground disabled:opacity-60"
      >
        <RotateCcw className="size-3.5" strokeWidth={2.2} />
        <span className="font-display text-[15px] font-semibold tracking-[0.12em] uppercase">
          {t.settings.resetWeek}
        </span>
      </button>
    </div>
  );
}
