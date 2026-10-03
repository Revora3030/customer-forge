import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/ui/notify";
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES, compressImage } from "@/lib/media";
import type { PendingPhoto } from "@/components/onboarding/owner-photos";

const CATEGORY_LABEL: Record<PendingPhoto["category"], string> = {
  hero: "Main photo",
  work: "Our work",
  team: "Team",
  premises: "Shop / place",
};

async function prepare(file: File): Promise<File | null> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    toast.error(`${file.name}: only JPG, PNG, WebP or AVIF.`);
    return null;
  }
  const compressed = await compressImage(file);
  if (compressed.size > MAX_UPLOAD_BYTES) {
    toast.error(`${file.name} is too large (max 10 MB).`);
    return null;
  }
  return compressed;
}

/**
 * Lets a new customer add their own photos and logo during onboarding. Works
 * before the workspace exists: picked files are held in the page and saved the
 * moment the workspace is created (see `saveOwnerPhotos`/`saveOwnerLogo`).
 */
export function OwnerPhotoUpload(props: {
  photos: PendingPhoto[];
  onPhotosChange: (photos: PendingPhoto[]) => void;
  logo: PendingPhoto | null;
  onLogoChange: (logo: PendingPhoto | null) => void;
  /** Photos already in the library from an earlier visit. */
  savedCount?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { photos, onPhotosChange, logo, onLogoChange } = props;

  // Free the in-page previews when the step unmounts.
  const previews = useRef<string[]>([]);
  useEffect(() => {
    previews.current = [...photos.map((p) => p.preview), ...(logo ? [logo.preview] : [])];
  }, [photos, logo]);
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const next = [...photos];
    for (const file of Array.from(files).slice(0, Math.max(0, 20 - photos.length))) {
      const ready = await prepare(file);
      if (!ready) continue;
      next.push({
        id: crypto.randomUUID(),
        file: ready,
        preview: URL.createObjectURL(ready),
        category: next.length === 0 && !props.savedCount ? "hero" : "work",
      });
    }
    setBusy(false);
    onPhotosChange(next);
  }

  async function pickLogo(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const ready = file.type === "image/svg+xml" ? file : await prepare(file);
    if (!ready) return;
    if (logo) URL.revokeObjectURL(logo.preview);
    onLogoChange({
      id: crypto.randomUUID(),
      file: ready,
      preview: URL.createObjectURL(ready),
      category: "work",
    });
  }

  return (
    <div className="space-y-4 sm:col-span-2">
      <div className="space-y-2">
        <p className="text-[13px] font-medium">Your logo</p>
        <input
          ref={logoInput}
          type="file"
          accept={[...ACCEPTED_IMAGE_TYPES, "image/svg+xml"].join(",")}
          className="hidden"
          onChange={(e) => {
            void pickLogo(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="flex items-center gap-3">
          {logo ? (
            <img
              src={logo.preview}
              alt="Your logo"
              className="h-12 w-auto max-w-[160px] rounded border border-border bg-white object-contain p-1"
            />
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => logoInput.current?.click()}
          >
            <ImagePlus className="size-4" />
            {logo ? "Change logo" : "Upload logo"}
          </Button>
          {logo ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onLogoChange(null)}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[13px] font-medium">Your business photos</p>
        <p className="text-[12px] text-muted-foreground">
          Add photos of your work, place or team (up to 20). They always go on your site before any
          AI picture. Tag each one so it lands in the right spot.
          {props.savedCount ? ` ${props.savedCount} already saved from before.` : ""}
        </p>
        <input
          ref={input}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={(e) => {
            void add(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || photos.length >= 20}
          onClick={() => input.current?.click()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          {busy ? "Preparing…" : "Add photos"}
        </Button>
        {photos.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {photos.map((photo) => (
              <div key={photo.id} className="space-y-1">
                <div className="relative">
                  <img
                    src={photo.preview}
                    alt="Your business photo"
                    className="aspect-square w-full rounded-md object-cover"
                  />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    className="absolute right-1 top-1 inline-flex size-7 items-center justify-center rounded-full bg-black/60 text-white"
                    onClick={() => {
                      URL.revokeObjectURL(photo.preview);
                      onPhotosChange(photos.filter((p) => p.id !== photo.id));
                    }}
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <select
                  aria-label="Where this photo goes"
                  value={photo.category}
                  onChange={(e) => {
                    const category = e.target.value as PendingPhoto["category"];
                    onPhotosChange(
                      photos.map((p) =>
                        p.id === photo.id
                          ? { ...p, category }
                          : category === "hero" && p.category === "hero"
                            ? { ...p, category: "work" }
                            : p,
                      ),
                    );
                  }}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-[12px]"
                >
                  {(Object.keys(CATEGORY_LABEL) as PendingPhoto["category"][]).map((key) => (
                    <option key={key} value={key}>
                      {CATEGORY_LABEL[key]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
