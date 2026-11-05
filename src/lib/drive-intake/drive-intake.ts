/**
 * BIL-12 / L32: Google Drive photo intake. Pure helpers (no network), so the
 * rules are unit-tested: which folder link is valid, which Drive files are
 * imported, and the stable storage path that makes re-imports idempotent.
 */
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/media";

export type DriveFile = { id: string; name: string; mimeType: string; size: number | null };

export type DriveSkip = {
  name: string;
  reason: "unsupported_type" | "too_large" | "already_imported";
};

/** Drive folder ids are URL-safe base64-ish strings. */
const FOLDER_ID = /^[A-Za-z0-9_-]{10,100}$/;

/** Accepts a Drive folder link (any common form) or a bare folder id. */
export function parseDriveFolderId(input: string): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  if (FOLDER_ID.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.hostname !== "drive.google.com") return null;
  const fromPath = url.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/)?.[1];
  const candidate = fromPath ?? (url.pathname === "/open" ? url.searchParams.get("id") : null);
  return candidate && FOLDER_ID.test(candidate) ? candidate : null;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/** One Drive file always maps to the same object, so importing twice is a no-op. */
export function drivePhotoPath(
  organizationId: string,
  file: Pick<DriveFile, "id" | "mimeType">,
): string {
  return `${organizationId}/drive-${file.id.replace(/[^A-Za-z0-9_-]/g, "")}.${EXT[file.mimeType] ?? "jpg"}`;
}

/** Splits a folder listing into files to import and honest skip reasons. */
export function planDriveImport(
  organizationId: string,
  files: DriveFile[],
  existingPaths: Set<string>,
  limit = 25,
): { toImport: DriveFile[]; skipped: DriveSkip[]; remaining: number } {
  const toImport: DriveFile[] = [];
  const skipped: DriveSkip[] = [];
  let remaining = 0;
  for (const f of files) {
    if (!ACCEPTED_IMAGE_TYPES.includes(f.mimeType))
      skipped.push({ name: f.name, reason: "unsupported_type" });
    else if (f.size !== null && f.size > MAX_UPLOAD_BYTES)
      skipped.push({ name: f.name, reason: "too_large" });
    else if (existingPaths.has(drivePhotoPath(organizationId, f)))
      skipped.push({ name: f.name, reason: "already_imported" });
    else if (toImport.length >= limit) remaining++;
    else toImport.push(f);
  }
  return { toImport, skipped, remaining };
}
