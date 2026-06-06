// Progress-photo blob storage. Images live on disk under data/photos/ (gitignored)
// rather than in the DB. This is the single swap point if we later move to an
// object store (R2/Blob): keep the same three functions, change the bodies.

import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

const DIR = join(process.cwd(), "data", "photos");

// IDs are nanoids (alphabet A–Za–z0–9_-) — reject anything else so a crafted
// id can't escape the photos directory.
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

function pathFor(id: string): string | null {
  return SAFE_ID.test(id) ? join(DIR, id) : null;
}

export async function savePhoto(id: string, bytes: Uint8Array): Promise<void> {
  const path = pathFor(id);
  if (!path) throw new Error("invalid photo id");
  await mkdir(DIR, { recursive: true });
  await writeFile(path, bytes);
}

export async function readPhoto(id: string): Promise<Buffer | null> {
  const path = pathFor(id);
  if (!path) return null;
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

export async function deletePhotoFile(id: string): Promise<void> {
  const path = pathFor(id);
  if (!path) return;
  try {
    await unlink(path);
  } catch {
    /* already gone — fine */
  }
}
