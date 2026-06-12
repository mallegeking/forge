"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, MessageCircle, Utensils, Scale } from "lucide-react";
import { useT } from "@/components/i18n/i18n-provider";

// The persistent root navigation from the "Ember" redesign. Four tabs map onto
// the existing routes (Train→home, Coach, Fuel→nutrition, Body→bodyweight).
// Hidden during an active session and on the login screen, where the design
// calls for a full-bleed, chrome-free layout.
const HIDDEN_PREFIXES = ["/session", "/login"];

export function BottomTabBar() {
  const t = useT();
  const pathname = usePathname();

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  const tabs = [
    { href: "/", label: t.tabs.train, Icon: House },
    { href: "/coach", label: t.tabs.coach, Icon: MessageCircle },
    { href: "/nutrition", label: t.tabs.fuel, Icon: Utensils },
    { href: "/bodyweight", label: t.tabs.body, Icon: Scale },
  ] as const;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-lg justify-between px-[30px] pt-3 pb-[max(env(safe-area-inset-bottom),12px)]">
        {tabs.map(({ href, label, Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-1 ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="size-[19px]" strokeWidth={2} />
              <span className="font-display text-[11px] font-semibold tracking-[0.16em] uppercase">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
