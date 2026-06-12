"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { useT } from "@/components/i18n/i18n-provider";

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function PhotoUploader() {
  const t = useT();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async () => {
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      fd.append("takenAt", date);
      fd.append("note", note);
      const res = await fetch("/api/photos", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          body.error === "too_large"
            ? t.photos.tooLarge
            : body.error === "no_image"
              ? t.photos.noImage
              : t.photos.uploadFailed
        );
        return;
      }
      setFile(null);
      setNote("");
      setDate(todayStr());
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch {
      setError(t.photos.uploadFailed);
    } finally {
      setUploading(false);
    }
  };

  const inputClass =
    "h-11 rounded-[12px] bg-foreground/[0.06] px-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <div className="flex flex-col gap-3 rounded-[16px] bg-card p-4">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-sm text-muted-foreground file:mr-3 file:rounded-[11px] file:border-0 file:bg-foreground/[0.07] file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-foreground"
      />
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            {t.photos.date}
          </span>
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t.photos.notePlaceholder}
          className={`${inputClass} min-w-0 flex-1`}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button
        type="button"
        onClick={upload}
        disabled={!file || uploading}
        className="flex h-[50px] w-full items-center justify-center gap-2.5 rounded-[12px] bg-primary text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        {uploading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Camera className="size-4" />
        )}
        <span className="font-display text-[17px] font-semibold tracking-[0.14em] uppercase">
          {uploading ? t.photos.uploading : t.photos.addPhoto}
        </span>
      </button>
    </div>
  );
}
