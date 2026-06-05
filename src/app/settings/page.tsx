import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, Sparkles } from "lucide-react";
import { getCoachSettings } from "@/lib/coach-config";
import { CoachSettingsForm } from "@/components/settings/coach-settings-form";

export const metadata: Metadata = { title: "Settings · Forge" };

// Reads the database (saved settings) per request.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const coach = await getCoachSettings();

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
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      </header>

      <section>
        <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <Sparkles className="size-3.5" />
          AI coach
        </h2>
        <CoachSettingsForm current={coach} />
      </section>
    </div>
  );
}
