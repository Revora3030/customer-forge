import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/ui/notify";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  MEDIA_BUCKET,
  buildObjectPath,
  compressImage,
} from "@/lib/media";

/**
 * Lets a new customer add their own business photos during onboarding.
 * Photos land in their media library and the first build places them on the
 * site before any AI picture.
 */
export function OwnerPhotoUpload({ organizationId }: { organizationId: string | null | undefined }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<string[]>([]);

  async function upload(files: FileList | null) {
    if (!files?.length || !organizationId) return;
    setBusy(true);
    let ok = 0;
    for (const file of Array.from(files).slice(0, 12)) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        toast.error(`${file.name}: only JPG, PNG, WebP or AVIF.`);
        continue;
      }
      try {
        const compressed = await compressImage(file);
        if (compressed.size > MAX_UPLOAD_BYTES) {
          toast.error(`${file.name} is too large.`);
          continue;
        }
        const path = buildObjectPath(organizationId, file.name);
        const { error: upErr } = await supabase.storage
          .from(MEDIA_BUCKET)
          .upload(path, compressed, { contentType: compressed.type, upsert: false });
        if (upErr) throw upErr;
        const { error: rowErr } = await supabase.from("media").insert({
          organization_id: organizationId,
          url: path,
          category: added.length + ok === 0 ? "hero" : "work",
          file_name: file.name,
          size_bytes: compressed.size,
          source: "owner",
        } as never);
        if (rowErr) {
          await supabase.storage.from(MEDIA_BUCKET).remove([path]);
          throw rowErr;
        }
        ok += 1;
        setAdded((prev) => [...prev, URL.createObjectURL(compressed)]);
      } catch {
        toast.error(`${file.name} could not be saved.`);
      }
    }
    setBusy(false);
    if (ok) toast.success(`${ok} photo${ok > 1 ? "s" : ""} added — they'll go on your site.`);
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <p className="text-[13px] font-medium">Your business photos</p>
      <p className="text-[12px] text-muted-foreground">
        Add photos of your work, place or team. The first one becomes your main photo. You can add more later in the chat.
      </p>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        multiple
        className="hidden"
        onChange={(e) => {
          void upload(e.target.files);
          e.target.value = "";
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy || !organizationId} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
        {busy ? "Uploading…" : "Upload photos"}
      </Button>
      {added.length ? (
        <div className="grid grid-cols-4 gap-2">
          {added.map((src) => (
            <img key={src} src={src} alt="Uploaded business photo" className="aspect-square w-full rounded-md object-cover" />
          ))}
        </div>
      ) : null}
    </div>
  );
}
