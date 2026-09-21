import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { generateStudioImage } from "@/lib/image-studio.functions";
import type { StarterImageReport } from "@/lib/site-brief";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  MEDIA_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  buildObjectPath,
  compressImage,
  isStoragePath,
} from "@/lib/media";

type StarterRow = {
  id: string;
  url: string;
  alt_text: string | null;
  category: string | null;
  attribution: string | null;
  preview: string;
};

/** Plain-language headline for how the website got its opening pictures. */
function statusLine(report: StarterImageReport | null) {
  if (!report) return { tone: "neutral" as const, text: "No picture report from the last build yet." };
  if (report.status === "owner_photos")
    return { tone: "signal" as const, text: "Your own photos are being used — nothing was generated." };
  if (report.attached > 0)
    return {
      tone: "signal" as const,
      text: `${report.attached} starter picture(s) are on your website${
        report.source === "paid" ? " (made with the paid backup service)" : ""
      }.`,
    };
  return { tone: "attention" as const, text: report.message || "Revora used its own artwork instead of pictures." };
}

/**
 * STARTER PICTURES
 * ================
 *
 * Shows the truth about the pictures Revora put on the website at build time —
 * whether they were made, blocked, rejected by the picture check, or replaced by
 * Revora's own artwork — and lets the owner make another one, swap in their own
 * photo, or take it off entirely.
 *
 * Starter pictures are never presented as photos of real work, staff or results.
 */
export function StarterImages({
  organizationId,
  canManage,
  report,
  businessName,
  industry,
  city,
}: {
  organizationId: string | undefined;
  canManage: boolean;
  report: StarterImageReport | null;
  businessName: string | null;
  industry: string | null;
  city: string | null;
}) {
  const queryClient = useQueryClient();
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<StarterRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const status = statusLine(report);

  const starterQuery = useQuery({
    queryKey: ["starter-images", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<StarterRow[]> => {
      const { data, error } = await supabase
        .from("media")
        .select("id, url, alt_text, category, attribution")
        .eq("organization_id", organizationId!)
        .eq("source", "generated")
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      const rows = data ?? [];
      const paths = rows.map((row) => row.url).filter(isStoragePath);
      const signed = new Map<string, string>();
      if (paths.length) {
        const { data: urls } = await supabase.storage
          .from(MEDIA_BUCKET)
          .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
        for (const entry of urls ?? []) {
          if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
        }
      }
      return rows.map((row) => ({ ...row, preview: signed.get(row.url) ?? row.url }));
    },
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["starter-images", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["media", organizationId] });
  }, [queryClient, organizationId]);

  const remove = useMutation({
    mutationFn: async (row: StarterRow) => {
      if (isStoragePath(row.url)) await supabase.storage.from(MEDIA_BUCKET).remove([row.url]);
      const { error } = await supabase.from("media").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Starter picture removed. That spot now uses Revora's own artwork.");
      invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const regenerate = useMutation({
    mutationFn: async (row: StarterRow) => {
      const subject = (row.alt_text ?? "").trim() || `${industry ?? "business"} work`;
      const prompt = [
        `Starter website picture for ${businessName ?? "this business"}`,
        industry ? `industry: ${industry}` : "",
        city ? `location feel: ${city}` : "",
        `subject: ${subject}`,
        "Clean, premium, natural light, realistic. Do not show a real employee, customer, award, review, logo, licence plate, address or before-and-after result.",
      ]
        .filter(Boolean)
        .join(". ");
      const result = await generateStudioImage({
        data: {
          organizationId: organizationId!,
          prompt,
          altText: row.alt_text ?? subject,
          category: row.category ?? "other",
          label: "starter-picture",
        },
      });
      if (!result.ok) throw new Error(result.message);
    },
    onMutate: (row: StarterRow) => setBusyId(row.id),
    onSettled: () => setBusyId(null),
    onSuccess: () => {
      toast.success("A new starter picture was made and added to your library.");
      invalidate();
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const replaceWithOwnPhoto = useCallback(
    async (file: File | undefined) => {
      const target = replacing;
      setReplacing(null);
      if (!file || !target || !organizationId) return;
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        toast.error("Only JPG, PNG, WebP or AVIF images can be used.");
        return;
      }
      setBusyId(target.id);
      try {
        const compressed = await compressImage(file);
        if (compressed.size > MAX_UPLOAD_BYTES) {
          toast.error("That photo is too large. Please use a smaller one.");
          return;
        }
        const path = buildObjectPath(organizationId, file.name);
        const { error: uploadError } = await supabase.storage
          .from(MEDIA_BUCKET)
          .upload(path, compressed, { contentType: compressed.type, upsert: false });
        if (uploadError) throw uploadError;
        const { error: rowError } = await supabase.from("media").insert({
          organization_id: organizationId,
          url: path,
          category: target.category ?? "work",
          file_name: file.name,
          size_bytes: compressed.size,
          alt_text: target.alt_text,
          source: "owner",
        } as never);
        if (rowError) {
          await supabase.storage.from(MEDIA_BUCKET).remove([path]);
          throw rowError;
        }
        if (isStoragePath(target.url)) {
          await supabase.storage.from(MEDIA_BUCKET).remove([target.url]);
        }
        await supabase.from("media").delete().eq("id", target.id);
        toast.success("Your photo replaced the starter picture.");
        invalidate();
      } catch (error) {
        toast.error(friendlyError(error as Error));
      } finally {
        setBusyId(null);
      }
    },
    [replacing, organizationId, invalidate],
  );

  const rows = starterQuery.data ?? [];

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading eyebrow="Starter pictures" title="Where your opening pictures came from" />
        <Pill tone={status.tone}>
          {report?.status === "owner_photos"
            ? "Your photos"
            : report && report.attached > 0
              ? "Starter pictures"
              : "Revora artwork"}
        </Pill>
      </div>

      <p className="mt-2 text-[13px] text-muted-foreground">{status.text}</p>
      {report?.paidNote ? (
        <p className="mt-1 text-[12px] text-muted-foreground">{report.paidNote}</p>
      ) : null}

      {report?.rejected?.length ? (
        <ul className="mt-3 space-y-1.5 text-[12px] text-muted-foreground">
          {report.rejected.map((item) => (
            <li key={`${item.slot}-${item.label}`}>
              The {item.label} picture was not used because {item.reason}.
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-3 text-[12px] text-muted-foreground">
        Starter pictures set the mood only. They are never shown as photos of your real work, your
        team or your results — swap in your own photos whenever you can.
      </p>

      {rows.length ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <div key={row.id} className="overflow-hidden rounded-xl border border-border/60">
              <img
                src={row.preview}
                alt={row.alt_text ?? "Starter website picture"}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
              <div className="space-y-2 p-3">
                <p className="line-clamp-2 text-[12px] text-muted-foreground">
                  {row.alt_text ?? "Starter website picture"}
                </p>
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="min-h-9"
                      data-testid="starter-image-regenerate"
                      disabled={busyId === row.id || regenerate.isPending}
                      onClick={() => regenerate.mutate(row)}
                    >
                      {busyId === row.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3.5" />
                      )}
                      Make another
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="min-h-9"
                      data-testid="starter-image-replace"
                      disabled={busyId === row.id}
                      onClick={() => {
                        setReplacing(row);
                        replaceRef.current?.click();
                      }}
                    >
                      <UploadCloud className="size-3.5" />
                      Use my photo
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="min-h-9 text-destructive"
                      data-testid="starter-image-remove"
                      disabled={busyId === row.id || remove.isPending}
                      onClick={() => remove.mutate(row)}
                    >
                      <Trash2 className="size-3.5" />
                      Remove
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-[13px] text-muted-foreground">
          There are no starter pictures in your library. Add your own photos below and they will be
          used everywhere instead.
        </p>
      )}

      <input
        ref={replaceRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(event) => {
          void replaceWithOwnPhoto(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </Panel>
  );
}
