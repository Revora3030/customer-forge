import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/ui/notify";
import { MEDIA_BUCKET, buildObjectPath } from "@/lib/media";

/** A photo picked during onboarding, before or after it reached storage. */
export type PendingPhoto = {
  id: string;
  file: File;
  preview: string;
  category: "hero" | "work" | "team" | "premises";
};

/**
 * Uploads picked photos into the workspace's media library. Owner photos are
 * marked `source: "owner"` so the first build always places them before any AI
 * picture. Returns how many were saved; failures are reported per file and
 * never block finishing onboarding.
 */
export async function saveOwnerPhotos(
  organizationId: string,
  photos: PendingPhoto[],
): Promise<number> {
  let saved = 0;
  // One main photo at most: the first one the owner marked (or the first photo).
  const heroId = photos.find((p) => p.category === "hero")?.id ?? photos[0]?.id;
  for (const photo of photos) {
    const path = buildObjectPath(organizationId, photo.file.name);
    try {
      const { error: upErr } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, photo.file, { contentType: photo.file.type, upsert: false });
      if (upErr) throw upErr;
      const category =
        photo.id === heroId ? "hero" : photo.category === "hero" ? "work" : photo.category;
      const { error: rowErr } = await supabase.from("media").insert({
        organization_id: organizationId,
        url: path,
        category,
        file_name: photo.file.name,
        size_bytes: photo.file.size,
        source: "owner",
      } as never);
      if (rowErr) {
        await supabase.storage.from(MEDIA_BUCKET).remove([path]);
        throw rowErr;
      }
      saved += 1;
    } catch {
      toast.error(`${photo.file.name} could not be saved. You can add it later in the builder.`);
    }
  }
  return saved;
}

/** Uploads a logo file and returns its storage path for `business_profiles.logo_url`. */
export async function saveOwnerLogo(organizationId: string, file: File): Promise<string | null> {
  const path = buildObjectPath(organizationId, `logo-${file.name}`);
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    toast.error("Your logo could not be saved. You can add it later in the builder.");
    return null;
  }
  const { error: rowErr } = await supabase.from("media").insert({
    organization_id: organizationId,
    url: path,
    category: "logo",
    file_name: file.name,
    size_bytes: file.size,
    source: "owner",
  } as never);
  if (rowErr) {
    // The logo still works from the profile; the library row is a convenience.
    console.warn("[onboarding] logo library row not saved", rowErr.message);
  }
  return path;
}
