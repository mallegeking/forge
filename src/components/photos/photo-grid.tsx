"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deletePhotoAction } from "@/app/actions";
import { formatRelativeDay } from "@/lib/format";
import { useT, useLocale } from "@/components/i18n/i18n-provider";
import type { ProgressPhoto } from "@/db/schema";

export function PhotoGrid({ photos }: { photos: ProgressPhoto[] }) {
  const t = useT();
  const locale = useLocale();
  const [, startTransition] = useTransition();

  if (photos.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {t.photos.empty}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {photos.map((p) => (
        <figure
          key={p.id}
          className="relative overflow-hidden rounded-[14px] bg-card"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/photos/${p.id}`}
            alt={p.note ?? t.photos.altFallback}
            loading="lazy"
            className="aspect-[3/4] w-full bg-muted object-cover"
          />
          <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-2">
            <span className="min-w-0">
              <span className="block text-xs font-medium text-white">
                {formatRelativeDay(p.takenAt, t.common, locale)}
              </span>
              {p.note && (
                <span className="block truncate text-[0.65rem] text-white/80">
                  {p.note}
                </span>
              )}
            </span>
            <button
              type="button"
              aria-label={t.photos.deletePhoto}
              onClick={() => {
                if (confirm(t.photos.confirmDelete))
                  startTransition(() => void deletePhotoAction({ id: p.id }));
              }}
              className="flex size-7 shrink-0 items-center justify-center rounded-md bg-black/40 text-white hover:bg-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
