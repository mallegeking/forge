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
            {t.photos.title}
          </h1>
          <p className="text-xs text-muted-foreground">{t.photos.subtitle}</p>
        </div>
      </header>

      <div className="mb-4">
        <PhotoUploader />
      </div>

      <PhotoGrid photos={photos} />
    </div>
  );
}
