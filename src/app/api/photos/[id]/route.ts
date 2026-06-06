// Serves a progress photo's bytes with its stored content type. Gated behind
// the passcode by src/proxy.ts, so photos aren't public like files in /public.

import { getPhoto } from "@/lib/queries";
import { readPhoto } from "@/lib/photo-storage";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const photo = await getPhoto(id);
  if (!photo) return new Response("Not found", { status: 404 });

  const bytes = await readPhoto(id);
  if (!bytes) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": photo.mimeType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
