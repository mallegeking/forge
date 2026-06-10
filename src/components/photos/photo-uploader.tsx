"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  return (
    <Card className="gap-3 p-4">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground"
      />
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t.photos.date}</span>
          <Input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className="h-11"
          />
        </label>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t.photos.notePlaceholder}
          className="h-11 flex-1"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button onClick={upload} disabled={!file || uploading} className="h-11 gap-1.5">
        {uploading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Camera className="size-4" />
        )}
        {uploading ? t.photos.uploading : t.photos.addPhoto}
      </Button>
    </Card>
  );
}
