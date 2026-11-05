/**
 * Settings profile photo helpers.
 *
 * Bytes live in the public `avatars` bucket at `<userId>/avatar.<ext>`.
 * The public URL is written to auth user_metadata.avatar_url and
 * profiles.avatar_url so ensureProfile keeps the same value on the next
 * sign-in (same path Google OAuth picture URLs already use).
 */
import { supabase } from "@/integrations/supabase/client";
import { ACCEPTED_IMAGE_TYPES, compressImage, humanFileSize } from "@/lib/media";

export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_ACCEPT = ACCEPTED_IMAGE_TYPES.join(",");

export type AvatarValidation =
  | { ok: true; file: File }
  | { ok: false; message: string };

export function validateAvatarFile(file: File | null | undefined): AvatarValidation {
  if (!file) return { ok: false, message: "Choose a photo." };
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, message: "Use a JPG, PNG, WebP, or AVIF photo." };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return {
      ok: false,
      message: `Keep the photo under ${humanFileSize(AVATAR_MAX_BYTES)}.`,
    };
  }
  return { ok: true, file };
}

export function avatarObjectPath(userId: string, fileName: string): string {
  const ext = (fileName.match(/\.([a-z0-9]+)$/i)?.[1] ?? "jpg").toLowerCase();
  const safe = ext === "jpeg" ? "jpg" : ext;
  return `${userId}/avatar.${safe}`;
}

export function avatarPublicUrl(path: string, cacheBust?: number): string {
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const base = data.publicUrl;
  if (!cacheBust) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}v=${cacheBust}`;
}

export function isManagedAvatarUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes(`/object/public/${AVATAR_BUCKET}/`) || url.includes(`/${AVATAR_BUCKET}/`);
}

export function managedAvatarPathFromUrl(url: string, userId: string): string | null {
  if (!isManagedAvatarUrl(url)) return null;
  // Match ".../avatars/<userId>/avatar.ext" ignoring querystring.
  const bare = url.split("?")[0] ?? url;
  const marker = `/${AVATAR_BUCKET}/`;
  const idx = bare.indexOf(marker);
  if (idx < 0) return null;
  const path = bare.slice(idx + marker.length);
  if (!path.startsWith(`${userId}/`)) return null;
  return path;
}

export async function persistAvatarUrl(userId: string, url: string | null): Promise<void> {
  const { error: metaError } = await supabase.auth.updateUser({
    data: { avatar_url: url, picture: url },
  });
  if (metaError) throw metaError;
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: url, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw error;
}

export async function uploadAccountAvatar(userId: string, file: File): Promise<string> {
  const v = validateAvatarFile(file);
  if (!v.ok) throw new Error(v.message);
  const compressed = await compressImage(v.file, { maxEdge: 512, quality: 0.85 });
  if (compressed.size > AVATAR_MAX_BYTES) {
    throw new Error(`Keep the photo under ${humanFileSize(AVATAR_MAX_BYTES)}.`);
  }
  const path = avatarObjectPath(userId, compressed.name || v.file.name);
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, compressed, { contentType: compressed.type || "image/jpeg", upsert: true });
  if (uploadError) throw uploadError;
  const url = avatarPublicUrl(path, Date.now());
  await persistAvatarUrl(userId, url);
  return url;
}

export async function clearAccountAvatar(
  userId: string,
  currentUrl: string | null | undefined,
): Promise<void> {
  const path = managedAvatarPathFromUrl(currentUrl ?? "", userId) ?? `${userId}/avatar.jpg`;
  // Best-effort remove; metadata/profile clear is what the product promises.
  await supabase.storage.from(AVATAR_BUCKET).remove([path]).catch(() => undefined);
  // Also try common extensions when the URL was an external (Google) picture.
  if (!managedAvatarPathFromUrl(currentUrl ?? "", userId)) {
    await supabase.storage
      .from(AVATAR_BUCKET)
      .remove([`${userId}/avatar.png`, `${userId}/avatar.webp`, `${userId}/avatar.avif`])
      .catch(() => undefined);
  }
  await persistAvatarUrl(userId, null);
}
