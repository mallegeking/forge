"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/config";
import { setLocaleAction } from "@/app/actions";
import { useT, useLocale } from "@/components/i18n/i18n-provider";

export function LanguageSwitcher() {
  const t = useT();
  const active = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(locale: string) {
    if (locale === active || pending) return;
    startTransition(async () => {
      await setLocaleAction(locale);
      router.refresh();
    });
  }

  return (
    <div>
      <p className="mb-2 px-1 text-xs text-muted-foreground">
        {t.settings.languageHint}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {LOCALES.map((locale) => {
          const isActive = locale === active;
          return (
            <button
              key={locale}
              type="button"
              onClick={() => choose(locale)}
              disabled={pending}
              aria-pressed={isActive}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium ring-1 transition-colors disabled:opacity-60 ${
                isActive
                  ? "bg-primary/15 text-primary ring-primary/40"
                  : "bg-card text-foreground ring-foreground/10 hover:bg-muted/40"
              }`}
            >
              {isActive && <Check className="size-4" />}
              {LOCALE_LABELS[locale]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
