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
    <div className="-mx-4 -mt-5 animate-[fadeIn_0.3s_ease] px-[22px] pb-2">
      <header className="-mx-[22px] flex items-center gap-2.5 px-[22px] pt-2 pb-[18px]">
        <Link
          href="/"
          aria-label={t.common.back}
          className="-m-1.5 shrink-0 p-1.5 text-muted-foreground"
        >
          <ChevronLeft className="size-[18px]" strokeWidth={2.2} />
        </Link>
        <span className="font-display text-[17px] font-bold leading-none tracking-[0.14em] uppercase">
          {t.settings.title}
        </span>
      </header>

      <section className="mb-6">
        <h2 className="mb-2.5 flex items-center gap-1.5 font-semibold text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
          <Languages className="size-3.5" />
          {t.settings.language}
        </h2>
        <LanguageSwitcher />
      </section>

      <section>
        <h2 className="mb-2.5 flex items-center gap-1.5 font-semibold text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
          <Sparkles className="size-3.5" />
          {t.settings.aiCoach}
        </h2>
        <CoachSettingsForm current={coach} />
      </section>
    </div>
  );
}
