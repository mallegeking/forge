import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { CoachChat } from "@/components/coach/coach-chat";
import { getDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Coach · Forge" };

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ ask?: string }>;
}) {
  const [{ ask }, t] = await Promise.all([searchParams, getDict()]);
  return (
    <div>
      <header className="mb-4 flex items-center gap-2">
        <Link
          href="/"
          aria-label={t.common.back}
          className="-ml-2 flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {t.coach.title}
          </h1>
          <p className="text-xs text-muted-foreground">{t.coach.subtitle}</p>
        </div>
      </header>

      <CoachChat initialInput={ask ?? ""} />
    </div>
  );
}
