import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { friendlyError } from "@/lib/user-error";
import { searchStockPhotos, saveStockPhoto } from "@/lib/stock-photos.functions";
import { licenceLine, requiresCredit, type StockPhoto } from "@/lib/builder/stock-photos";

/**
 * Free, openly licensed photography for a site with no pictures of its own.
 *
 * Only pictures a business is allowed to use commercially are shown, and the
 * licence and credit line are saved with the picture so the site stays within
 * the licence once it is live.
 */
export function StockPhotoPanel({
  organizationId,
  canManage,
  industry,
}: {
  organizationId: string | undefined;
  canManage: boolean;
  industry: string | null;
}) {
  const queryClient = useQueryClient();
  const [topic, setTopic] = useState("");
  const [photos, setPhotos] = useState<StockPhoto[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const search = useServerFn(searchStockPhotos);
  const save = useServerFn(saveStockPhoto);

  const searching = useMutation({
    mutationFn: async () => search({ data: { topic, industry } }),
    onSuccess: (result) => {
      setPhotos(result.photos);
      setNotice(
        result.error
          ? result.error
          : result.photos.length === 0
            ? "No pictures matched that. Try plainer words, like “shop front” or “kitchen”."
            : null,
      );
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const saving = useMutation({
    mutationFn: async (photo: StockPhoto) => {
      if (!organizationId) throw new Error("No website selected.");
      return save({ data: { organizationId, photo, altText: photo.title } });
    },
    onSuccess: () => {
      toast.success("Added to your photos, with its credit recorded.");
      void queryClient.invalidateQueries({ queryKey: ["media", organizationId] });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  if (!canManage) return null;

  return (
    <Panel>
      <SectionHeading
        title="Free photo library"
        description="Openly licensed photographs you are allowed to use on a business website. The credit line is saved with each picture."
      />

      <div className="flex flex-wrap gap-2">
        <input
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && topic.trim()) searching.mutate();
          }}
          maxLength={120}
          placeholder="What should the picture show? e.g. shop front"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-white/30"
        />
        <Button
          onClick={() => searching.mutate()}
          disabled={!topic.trim() || searching.isPending}
        >
          {searching.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Search className="mr-2 size-4" />
          )}
          Find photos
        </Button>
      </div>

      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      {photos && photos.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => (
            <figure key={photo.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
              <img
                src={photo.thumbnail}
                alt={photo.title}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
              <figcaption className="space-y-2 p-2">
                <p className="line-clamp-2 text-xs text-muted-foreground">{licenceLine(photo)}</p>
                {requiresCredit(photo.licenseCode) ? <Pill>Credit required</Pill> : <Pill>No credit needed</Pill>}
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  disabled={saving.isPending}
                  onClick={() => saving.mutate(photo)}
                >
                  Use this photo
                </Button>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}
