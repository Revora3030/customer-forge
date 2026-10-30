/**
 * Shared media helpers for the Revora media library.
 *
 * Photos live in the private `tenant-media` bucket under `<organizationId>/<file>`.
 * The `media.url` column (and `business_profiles.logo_url` / `hero_image_url`)
 * may therefore hold either a full external URL or a bucket object path — this
 * module owns that distinction so every read path treats it the same way.
 */

export const MEDIA_BUCKET = "tenant-media";

/** Long-lived signed URLs: long enough for page caching, short enough to rotate. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

/** Short-lived links for signed-in workspace views, so removed teammates lose access quickly. */
export const WORKSPACE_SIGNED_URL_TTL_SECONDS = 60 * 60;

/** True when a bucket path sits inside the given organization's folder. */
export function isOrgStoragePath(path: string, organizationId: string): boolean {
  return !!organizationId && path.startsWith(`${organizationId}/`) && !path.includes("..");
}

export const MEDIA_CATEGORIES = [
  { id: "hero", label: "Hero / banner" },
  { id: "work", label: "Completed work" },
  { id: "team", label: "Team" },
  { id: "premises", label: "Shop or vehicle" },
  { id: "before", label: "Before (your real job)" },
  { id: "after", label: "After (your real job)" },
  { id: "logo", label: "Logo" },
  { id: "other", label: "Other" },
] as const;

export type MediaCategory = (typeof MEDIA_CATEGORIES)[number]["id"];

/** True when the stored value is a bucket object path rather than a public URL. */
export function isStoragePath(value: string | null | undefined): boolean {
  if (!value) return false;
  return !/^(https?:)?\/\//i.test(value) && !value.startsWith("data:");
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Browser-side downscale + re-encode so business owners can drag in phone
 * photos without waiting on 8 MB uploads or hurting their page speed score.
 * Falls back to the original file if the canvas pipeline is unavailable.
 */
export async function compressImage(
  file: File,
  options: { maxEdge?: number; quality?: number } = {},
): Promise<File> {
  const maxEdge = options.maxEdge ?? 1800;
  const quality = options.quality ?? 0.82;
  if (typeof document === "undefined" || !file.type.startsWith("image/")) return file;
  if (file.type === "image/svg+xml") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Collision-proof, path-safe object key inside the tenant's folder. */
export function buildObjectPath(organizationId: string, fileName: string): string {
  const ext = (fileName.match(/\.([a-z0-9]+)$/i)?.[1] ?? "jpg").toLowerCase();
  const stem =
    fileName
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "photo";
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${organizationId}/${stem}-${unique}.${ext}`;
}
