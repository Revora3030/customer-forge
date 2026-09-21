import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Star, Trash2, UploadCloud } from "lucide-react";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  MEDIA_BUCKET,
  MEDIA_CATEGORIES,
  SIGNED_URL_TTL_SECONDS,
  buildObjectPath,
  compressImage,
  humanFileSize,
  isStoragePath,
} from "@/lib/media";

type MediaRow = {
  id: string;
  url: string;
  alt_text: string | null;
  category: string | null;
  file_name: string | null;
  size_bytes: number | null;
  preview: string;
};

/**
 * Photo step of the guided builder. Uploads go straight to the tenant's own
 * folder in the private media bucket, so one business can never see or delete
 * another business's photos; previews are short-lived signed URLs.
 */
export function MediaLibrary({
  organizationId,
  canManage,
  heroUrl,
  onSetHero,
}: {
  organizationId: string | undefined;
  canManage: boolean;
  heroUrl?: string | null;
  onSetHero?: (value: string) => void;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [category, setCategory] = useState<string>("work");
  const [busy, setBusy] = useState(0);

  const mediaQuery = useQuery({
    queryKey: ["media", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<MediaRow[]> => {
      const { data, error } = await supabase
        .from("media")
        .select("id, url, alt_text, category, file_name, size_bytes")
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];

      const paths = rows.map((r) => r.url).filter(isStoragePath);
      const signed = new Map<string, string>();
      if (paths.length) {
        const { data: urls } = await supabase.storage
          .from(MEDIA_BUCKET)
          .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
        for (const entry of urls ?? []) {
          if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
        }
      }

      return rows.map((r) => ({ ...r, preview: signed.get(r.url) ?? r.url }));
    },
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["media", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["score-facts", organizationId] });
  }, [queryClient, organizationId]);

  const upload = useCallback(
    async (files: File[]) => {
      if (!organizationId || !files.length) return;
      const accepted = files.filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type));
      const rejected = files.length - accepted.length;
      if (rejected > 0)
        toast.error(`${rejected} file(s) skipped — only JPG, PNG, WebP or AVIF images.`);
      if (!accepted.length) return;

      setBusy((n) => n + accepted.length);
      let ok = 0;
      for (const original of accepted) {
        try {
          const file = await compressImage(original);
          if (file.size > MAX_UPLOAD_BYTES) {
            toast.error(
              `${original.name} is still ${humanFileSize(file.size)} — please use a smaller photo.`,
            );
            continue;
          }
          const path = buildObjectPath(organizationId, file.name);
          const { error: uploadError } = await supabase.storage
            .from(MEDIA_BUCKET)
            .upload(path, file, { contentType: file.type, upsert: false });
          if (uploadError) throw uploadError;

          const { error: rowError } = await supabase.from("media").insert({
            organization_id: organizationId,
            url: path,
            category,
            file_name: original.name.slice(0, 120),
            size_bytes: file.size,
            alt_text: null,
          });
          if (rowError) {
            await supabase.storage.from(MEDIA_BUCKET).remove([path]);
            throw rowError;
          }
          ok += 1;
        } catch (error) {
          toast.error(error instanceof Error ? error.message : `Couldn't upload ${original.name}.`);
        } finally {
          setBusy((n) => Math.max(0, n - 1));
        }
      }
      if (ok) {
        toast.success(ok === 1 ? "Photo added." : `${ok} photos added.`);
        invalidate();
      }
    },
    [organizationId, category, invalidate],
  );

  const removeMedia = useMutation({
    mutationFn: async (row: MediaRow) => {
      if (isStoragePath(row.url)) {
        await supabase.storage.from(MEDIA_BUCKET).remove([row.url]);
      }
      const { error } = await supabase.from("media").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Photo removed.");
      invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const rows = mediaQuery.data ?? [];

  return (
    <Panel className="p-5">
      <SectionHeading eyebrow="Step 4 · Photos" title="Your photo library" />
      <p className="mt-1.5 text-[13px] text-muted-foreground">
        Real photos of your work sell better than stock images. Drag them in — Revora resizes and
        optimises them for you.
      </p>

      {canManage ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {MEDIA_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1 text-[12px] transition-colors",
                  category === c.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-elevated",
                )}
                aria-pressed={category === c.id}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void upload(Array.from(e.dataTransfer.files));
            }}
            className={cn(
              "mt-4 rounded-lg border border-dashed p-6 text-center transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border",
            )}
          >
            <UploadCloud className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-[14px] font-medium">Drag photos here</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              JPG, PNG, WebP or AVIF · up to {humanFileSize(MAX_UPLOAD_BYTES)} each
            </p>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(",")}
              multiple
              className="hidden"
              onChange={(e) => {
                void upload(Array.from(e.target.files ?? []));
                e.currentTarget.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => inputRef.current?.click()}
              disabled={busy > 0}
            >
              {busy > 0 ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Uploading {busy}…
                </>
              ) : (
                <>
                  <ImagePlus className="size-4" aria-hidden="true" /> Choose photos
                </>
              )}
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-4 text-[13px] text-muted-foreground">
          You have view-only access, so photos can't be changed.
        </p>
      )}

      {mediaQuery.isLoading ? (
        <p className="mt-4 text-[13px] text-muted-foreground">Loading your photos…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted-foreground">
          No photos yet. Your website will use clean colour panels until you add some.
        </p>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((row) => (
            <li
              key={row.id}
              className="overflow-hidden rounded-md border border-border bg-elevated"
            >
              <img
                src={row.preview}
                alt={row.alt_text ?? row.file_name ?? "Business photo"}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
              <div className="space-y-2 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="truncate text-[12px] text-muted-foreground"
                    title={row.file_name ?? ""}
                  >
                    {row.file_name ?? "Photo"}
                  </span>
                  {heroUrl === row.url ? <Pill tone="signal">Hero</Pill> : null}
                </div>
                {canManage ? (
                  <div className="flex gap-1.5">
                    {onSetHero ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => onSetHero(row.url)}
                        disabled={heroUrl === row.url}
                      >
                        <Star className="size-3.5" aria-hidden="true" /> Hero
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${row.file_name ?? "photo"}`}
                      onClick={() => removeMedia.mutate(row)}
                      disabled={removeMedia.isPending}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
