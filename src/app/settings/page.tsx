import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, Sparkles, Languages } from "lucide-react";
import { getCoachSettings } from "@/lib/coach-config";
import { getDict } from "@/lib/i18n/server";
import { CoachSettingsForm } from "@/components/settings/coach-settings-form";
import { LanguageSwitcher } from "@/components/settings/language-switcher";

export const metadata: Metadata = { title: "Settings · Forge" };

// Reads the database (saved settings) per request.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [coach, t] = await Promise.all([getCoachSettings(), getDict()]);

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
        <h1 className="text-xl font-semibold tracking-tight">
          {t.settings.title}
        </h1>
      </header>

      <section className="mb-6">
        <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <Languages className="size-3.5" />
          {t.settings.language}
        </h2>
        <LanguageSwitcher />
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <Sparkles className="size-3.5" />
          {t.settings.aiCoach}
        </h2>
        <CoachSettingsForm current={coach} />
      </section>
    </div>
  );
}
