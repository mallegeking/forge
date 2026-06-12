"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

// History-aware back chevron for pages reachable from several places (e.g.
// the exercise page, opened from a session or the program). Falls back to
// home when the page was opened directly.
export function BackButton({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push("/");
      }}
      className={className}
    >
      <ChevronLeft className="size-[18px]" strokeWidth={2.2} />
    </button>
  );
}
