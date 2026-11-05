/**
 * Asset Swapper (B12-4). Opens when the owner clicks a picture in the builder
 * preview. The picture can be replaced with:
 *  - an upload or a picture already in this website's library,
 *  - a hand-checked free photo for the trade (#525 picks; licence and
 *    photographer are saved with it),
 *  - a new AI picture from the Image Studio pipeline (free providers only).
 * Each swap saves a restore point first, so it can be undone from here or from
 * history. Only the clicked picture changes.
 */
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Loader2, Sparkles, Undo2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { cleanAltText, swapOrigin, SWAP_ALT_MAX } from "@/lib/builder/asset-swap";
import { swapSitePicture } from "@/lib/builder/asset-swap.functions";
import { restoreSectionVersion } from "@/lib/site-restore.functions";
import { saveStockPhoto } from "@/lib/stock-photos.functions";
import { generateStudioImage, studioImageStatus } from "@/lib/image-studio.functions";
import { licenceLine } from "@/lib/builder/stock-photos";
import { picksForTrade, pickToStockPhoto } from "@/lib/builder/trade-photo-picks";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  MEDIA_BUCKET,
  WORKSPACE_SIGNED_URL_TTL_SECONDS,
  buildObjectPath,
  compressImage,
  humanFileSize,
  isStoragePath,
} from "@/lib/media";

export type AssetSwapTarget = {
  sectionId: string;
  path: string;
  label: string | null;
  alt: string;
};

type LibraryRow = {
  id: string;
  url: string;
  alt_text: string | null;
  source: string | null;
  preview: string;
};
type Tab = "library" | "free" | "ai";

const ORIGIN_LABEL = { customer: "Your photo", stock: "Free photo", generated: "AI-made" } as const;

export function AssetSwapPanel({
  organizationId,
  industry,
  target,
  onClose,
  onSwapped,
}: {
  organizationId: string | undefined;
  industry: string | null;
  target: AssetSwapTarget | null;
  onClose: () => void;
  /** The draft changed (swap or undo): refresh the preview and caches. */
  onSwapped: () => void;
}) {
  const open = Boolean(target && organizationId);
  return (
    <Sheet open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Swap this picture</SheetTitle>
          <SheetDescription>
            {target?.label ? `In “${target.label}”. ` : ""}Only this picture changes, and you can
            undo it.
          </SheetDescription>
        </SheetHeader>
        {open ? (
          <SwapBody
            key={`${target!.sectionId}:${target!.path}`}
            organizationId={organizationId!}
            industry={industry}
            target={target!}
            onSwapped={onSwapped}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SwapBody({
  organizationId,
  industry,
  target,
  onSwapped,
}: {
  organizationId: string;
  industry: string | null;
  target: AssetSwapTarget;
  onSwapped: () => void;
}) {
  const queryClient = useQueryClient();
  const swap = useServerFn(swapSitePicture);
  const restore = useServerFn(restoreSectionVersion);
  const saveStock = useServerFn(saveStockPhoto);
  const generate = useServerFn(generateStudioImage);
  const status = useServerFn(studioImageStatus);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("library");
  const [alt, setAlt] = useState(target.alt);
  const [note, setNote] = useState("");
  const [undo, setUndo] = useState<string | null>(null);
  const [made, setMade] = useState<{ mediaId: string; preview: string } | null>(null);

  const library = useQuery({
    queryKey: ["media", organizationId, "swap"],
    queryFn: async (): Promise<LibraryRow[]> => {
      const { data, error } = await supabase
        .from("media")
        .select("id, url, alt_text, source, license, file_name")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      // Logos and documents aren't site pictures; stock rows need their licence.
      const rows = (data ?? []).filter(
        (row) =>
          /\.(jpe?g|png|webp|avif)$/i.test(row.file_name ?? row.url) ||
          (!isStoragePath(row.url) && Boolean(row.license)),
      );
      const paths = rows.map((row) => row.url).filter(isStoragePath);
      const signed = new Map<string, string>();
      if (paths.length) {
        const { data: urls } = await supabase.storage
          .from(MEDIA_BUCKET)
          .createSignedUrls(paths, WORKSPACE_SIGNED_URL_TTL_SECONDS);
        for (const entry of urls ?? [])
          if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
      }
      return rows.map((row) => ({
        id: row.id,
        url: row.url,
        alt_text: row.alt_text,
        source: row.source,
        preview: signed.get(row.url) ?? row.url,
      }));
    },
  });

  const picks = useMemo(() => picksForTrade(industry, "card").map(pickToStockPhoto), [industry]);
  const studio = useQuery({
    queryKey: ["studio-image-status", organizationId],
    enabled: tab === "ai",
    staleTime: 60_000,
    queryFn: () => status({ data: { organizationId } }),
  });

  const description = cleanAltText(alt);
  const put = useMutation({
    mutationFn: async (mediaId: string) =>
      swap({
        data: {
          organizationId,
          sectionId: target.sectionId,
          path: target.path,
          mediaId,
          alt: description,
        },
      }),
    onSuccess: (result) => {
      if (result.unchanged) {
        toast.info("That picture is already in place.");
        return;
      }
      setUndo(result.versionId);
      toast.success("Picture swapped in your draft");
      onSwapped();
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const takeBack = useMutation({
    mutationFn: async (versionId: string) =>
      restore({ data: { organizationId, sectionId: target.sectionId, versionId } }),
    onSuccess: () => {
      setUndo(null);
      toast.success("Put the earlier picture back");
      onSwapped();
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const pickStock = useMutation({
    mutationFn: async (photo: (typeof picks)[number]) => {
      // Saved to the library with licence, photographer and source page first,
      // so the site never shows a web picture without its licence on file.
      const saved = await saveStock({
        data: { organizationId, photo, altText: description || photo.title },
      });
      return swap({
        data: {
          organizationId,
          sectionId: target.sectionId,
          path: target.path,
          mediaId: saved.id,
          alt: description || photo.title,
        },
      });
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["media", organizationId] });
      if (!result.unchanged) {
        setUndo(result.versionId);
        toast.success("Picture swapped in your draft");
        onSwapped();
      }
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const upload = useMutation({
    mutationFn: async (original: File) => {
      if (!ACCEPTED_IMAGE_TYPES.includes(original.type))
        throw new Error("Only JPG, PNG, WebP or AVIF pictures can be used.");
      const file = await compressImage(original);
      if (file.size > MAX_UPLOAD_BYTES)
        throw new Error(
          `That photo is still ${humanFileSize(file.size)}. Please use a smaller one.`,
        );
      const path = buildObjectPath(organizationId, file.name);
      const { error: uploadError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { data: row, error } = await supabase
        .from("media")
        .insert({
          organization_id: organizationId,
          url: path,
          category: "work",
          file_name: original.name.slice(0, 120),
          size_bytes: file.size,
          alt_text: description || null,
          source: "owner",
        } as never)
        .select("id")
        .single();
      if (error || !row) {
        await supabase.storage.from(MEDIA_BUCKET).remove([path]);
        throw error ?? new Error("Couldn't save that photo.");
      }
      return String((row as { id: string }).id);
    },
    onSuccess: (mediaId) => {
      void queryClient.invalidateQueries({ queryKey: ["media", organizationId] });
      put.mutate(mediaId);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const make = useMutation({
    mutationFn: async () => {
      const subject = description || "the business's work";
      const prompt = [
        `Photograph for a ${industry || "local service"} business website: ${subject}.`,
        note.trim() ? `Owner note: ${note.trim().slice(0, 300)}.` : "",
        "No readable text, logos, watermarks, fabricated proof, staff, customers, awards, reviews, or results.",
      ]
        .filter(Boolean)
        .join(" ");
      const result = await generate({
        data: { organizationId, prompt, altText: description, category: "other", label: "swap" },
      });
      if (!result.ok || !result.mediaId)
        throw new Error(result.message ?? "Couldn't make a picture right now.");
      return { mediaId: result.mediaId, preview: result.preview ?? "" };
    },
    onSuccess: (result) => {
      setMade(result);
      void queryClient.invalidateQueries({ queryKey: ["media", organizationId] });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const busy = put.isPending || pickStock.isPending || upload.isPending || takeBack.isPending;

  return (
    <div className="mt-4 space-y-4">
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Describe the picture</span>
        <Input
          value={alt}
          maxLength={SWAP_ALT_MAX}
          onChange={(event) => setAlt(event.target.value)}
          placeholder="e.g. Freshly cleaned driveway at a family home"
          aria-describedby="swap-alt-hint"
        />
        <span id="swap-alt-hint" className="block text-xs text-muted-foreground">
          {description
            ? "Kept with the new picture for screen readers and search."
            : "Needed before a picture can go on your site."}
        </span>
      </label>

      {undo ? (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 p-3 text-sm"
        >
          <span>Swapped. A restore point was saved first.</span>
          <Button
            size="sm"
            variant="outline"
            className="min-h-10"
            disabled={busy}
            onClick={() => takeBack.mutate(undo)}
          >
            {takeBack.isPending ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <Undo2 className="mr-1 size-4" />
            )}
            Undo
          </Button>
        </div>
      ) : null}

      <div
        role="tablist"
        aria-label="Where the new picture comes from"
        className="grid grid-cols-3 gap-1 rounded-xl bg-black/20 p-1"
      >
        {(
          [
            ["library", "Your photos"],
            ["free", "Free photos"],
            ["ai", "Make with AI"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "min-h-10 rounded-lg px-2 text-sm",
              tab === key ? "bg-white/10 font-medium" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "library" ? (
        <div className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) upload.mutate(file);
            }}
          />
          <Button
            className="min-h-11 w-full"
            variant="secondary"
            disabled={busy || !description}
            onClick={() => fileRef.current?.click()}
          >
            {upload.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <UploadCloud className="mr-2 size-4" />
            )}
            Upload a photo
          </Button>
          {library.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading your photos…</p>
          ) : null}
          {library.data && library.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No photos in your library yet.</p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            {(library.data ?? []).map((row) => (
              <button
                key={row.id}
                type="button"
                disabled={busy || !description}
                onClick={() => put.mutate(row.id)}
                className="group overflow-hidden rounded-xl border border-white/10 bg-black/20 text-left disabled:opacity-50"
              >
                <img
                  src={row.preview}
                  alt={row.alt_text ?? ""}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
                <span className="block p-2 text-xs text-muted-foreground">
                  {ORIGIN_LABEL[swapOrigin(row)]}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "free" ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Hand-checked free photos for your trade. The licence and photographer are saved with the
            picture. These show the trade, not your own work.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {picks.map((photo) => (
              <figure
                key={photo.id}
                className="overflow-hidden rounded-xl border border-white/10 bg-black/20"
              >
                <img
                  src={photo.thumbnail}
                  alt={photo.title}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
                <figcaption className="space-y-2 p-2">
                  <p className="line-clamp-2 text-xs text-muted-foreground">{licenceLine(photo)}</p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="min-h-10 w-full"
                    disabled={busy}
                    onClick={() => pickStock.mutate(photo)}
                  >
                    Use this
                  </Button>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "ai" ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {studio.data
              ? studio.data.available
                ? `Made with the free picture service${studio.data.remainingToday != null ? ` (${studio.data.remainingToday} left today)` : ""}. AI pictures are marked as AI-made and never shown as your own work.`
                : studio.data.message
              : "Checking the free picture service…"}
          </p>
          <Textarea
            value={note}
            maxLength={300}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Anything to change? e.g. brighter, wider, show a truck"
          />
          <Button
            className="min-h-11 w-full"
            disabled={make.isPending || !description || studio.data?.available === false}
            onClick={() => make.mutate()}
          >
            {make.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 size-4" />
            )}
            Make a new picture
          </Button>
          {made ? (
            <figure className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
              {made.preview ? (
                <img
                  src={made.preview}
                  alt={description}
                  className="aspect-[4/3] w-full object-cover"
                />
              ) : null}
              <figcaption className="p-2">
                <Button
                  size="sm"
                  className="min-h-10 w-full"
                  disabled={busy}
                  onClick={() => put.mutate(made.mediaId)}
                >
                  <ImagePlus className="mr-1 size-4" /> Use this picture
                </Button>
              </figcaption>
            </figure>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
