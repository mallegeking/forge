import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { getProgressPhotos } from "@/lib/queries";
import { getDict } from "@/lib/i18n/server";
import { PhotoUploader } from "@/components/photos/photo-uploader";
import { PhotoGrid } from "@/components/photos/photo-grid";

export const metadata: Metadata = { title: "Photos · Forge" };

// Reads the database (and serves user data) per request.
export const dynamic = "force-dynamic";

export default async function PhotosPage() {
  const [photos, t] = await Promise.all([getProgressPhotos(), getDict()]);

  return (
    <div className="-mx-4 -mt-5 animate-[fadeIn_0.3s_ease] px-[22px] pb-2">
      {/* Reached from the Body screen's camera icon, so back goes there. */}
      <header className="-mx-[22px] flex items-center justify-between px-[22px] pt-2 pb-[18px]">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href="/bodyweight"
            aria-label={t.common.back}
            className="-m-1.5 shrink-0 p-1.5 text-muted-foreground"
          >
            <ChevronLeft className="size-[18px]" strokeWidth={2.2} />
          </Link>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-display text-[17px] font-bold leading-none tracking-[0.14em] uppercase">
              {t.photos.title}
            </span>
            <span className="mt-1 truncate text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              {t.photos.subtitle}
            </span>
          </div>
        </div>
      </header>

      <div className="mb-4">
        <PhotoUploader />
      </div>

      <PhotoGrid photos={photos} />
    </div>
  );
}
