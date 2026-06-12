import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { CoachChat } from "@/components/coach/coach-chat";
import { getDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Coach · Forge" };

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ ask?: string }>;
}) {
  const [{ ask }, t] = await Promise.all([searchParams, getDict()]);

  // Full-height chat column: header pinned, messages scroll, composer at the
  // bottom (above the tab bar). Cancels the layout's gutters/padding.
  return (
    <div className="-mx-4 -mt-5 -mb-28 flex h-dvh flex-col animate-[fadeIn_0.3s_ease]">
      <header className="flex shrink-0 items-center justify-between px-[22px] pt-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" fill="currentColor" />
          <span className="font-display text-xl font-bold tracking-[0.18em] uppercase">
            {t.coach.title}
          </span>
        </div>
        <span className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          {t.coach.seesData}
        </span>
      </header>

      <CoachChat initialInput={ask ?? ""} />
    </div>
  );
}
