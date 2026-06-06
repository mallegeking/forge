// Progress-photo upload. A Route Handler (not a Server Action) because uploads
// exceed the 1 MB server-action body limit. Gated behind the passcode by
// src/proxy.ts. Writes the bytes to disk (lib/photo-storage) + a metadata row.

import { nanoid } from "nanoid";
import { savePhoto } from "@/lib/photo-storage";
import { createProgressPhoto } from "@/lib/mutations";

export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const file = form.get("photo");
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return Response.json({ error: "no_image" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "too_large" }, { status: 413 });
  }

  const takenAtRaw = String(form.get("takenAt") ?? "").trim();
  const note = String(form.get("note") ?? "");
  // A YYYY-MM-DD value is anchored to local noon to avoid timezone day-shifts.
  const takenAt = /^\d{4}-\d{2}-\d{2}$/.test(takenAtRaw)
    ? new Date(`${takenAtRaw}T12:00:00`)
    : undefined;

  const id = nanoid();
  const bytes = new Uint8Array(await file.arrayBuffer());
  await savePhoto(id, bytes);
  await createProgressPhoto({ id, mimeType: file.type, takenAt, note });

  return Response.json({ id }, { status: 201 });
}
