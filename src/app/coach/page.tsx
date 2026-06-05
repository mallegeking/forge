import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { CoachChat } from "@/components/coach/coach-chat";

export const metadata: Metadata = { title: "Coach · Forge" };

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ ask?: string }>;
}) {
  const { ask } = await searchParams;
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
          <h1 className="truncate text-xl font-semibold tracking-tight">Coach</h1>
          <p className="text-xs text-muted-foreground">
            Grounded in your logged training
          </p>
        </div>
      </header>

      <CoachChat initialInput={ask ?? ""} />
    </div>
  );
}
