import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "@/lib/ui/notify";
import { Button } from "@/components/ui/button";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { cn } from "@/lib/utils";
import {
  editStudioImage,
  generateStudioImage,
  studioImageStatus,
} from "@/lib/image-studio.functions";
import type { ImageBriefSpec } from "@/lib/builder/first-build-contract";

type Candidate = {
  id: string;
  styleLabel: string;
  preview: string;
  path: string;
};

/**
 * AI Image Studio — builder only.
 *
 * Decides what photography this specific website is missing, gives every shot a
 * production brief in the business's own visual language, then generates four
 * different directions to choose from. Chosen images land in the tenant's
 * private media library, so nothing here bypasses normal permissions.
 */
export function ImageStudio({
  organizationId,
  canManage,
  businessName,
  city,
  primaryColor,
  accentColor,
  services,
  campaign,
  mediaCount,
  hasHeroImage,
  onSetHero,
}: {
  organizationId: string | undefined;
  canManage: boolean;
  businessName?: string | null;
  industry?: string | null;
  city?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  services: { name: string }[];
  /** Complete image campaign authored by the AI for this site. */
  campaign?: unknown;
  mediaCount: number;
  hasHeroImage: boolean;
  onSetHero?: (path: string) => void;
}) {
  const queryClient = useQueryClient();
  const shots = useMemo(() => {
    if (!Array.isArray(campaign)) return [];
    return campaign.filter((item): item is ImageBriefSpec => {
      if (!item || typeof item !== "object") return false;
      const row = item as Partial<ImageBriefSpec>;
      return typeof row.label === "string" && typeof row.subject === "string" &&
        typeof row.altText === "string" && Array.isArray(row.section);
    });
  }, [campaign]);

  const [shotIndex, setShotIndex] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [changeFor, setChangeFor] = useState<string | null>(null);
  const [changeNote, setChangeNote] = useState("");
  const [aspectRatio, setAspectRatio] = useState<string>("16:9");

  /**
   * Live picture-making status. It is measured on the server (connected service,
   * verified free model, today's remaining free allowance) so this panel never
   * offers something it cannot actually do.
   */
  const status = useQuery({
    queryKey: ["studio-image-status", organizationId],
    enabled: Boolean(organizationId) && canManage,
    staleTime: 60_000,
    queryFn: () => studioImageStatus({ data: { organizationId: organizationId! } }),
  });

  const shot = shots[shotIndex];

  const brief = useMemo(() => {
    if (!shot) return null;
    const prompt = [
      `Subject: ${shot.subject}.`, `Purpose: ${shot.purpose}.`, `Environment: ${shot.environment}.`,
      `Action: ${shot.action}.`, `Lighting: ${shot.lighting}.`, `Camera: ${shot.camera}.`,
      `Framing: ${shot.framing}.`, `Mood: ${shot.mood}.`, `Palette: ${shot.palette}.`,
      `Focal point: ${shot.focalPoint}. Negative space: ${shot.negativeSpace}.`, shot.mobileCrop,
      ...shot.constraints, note ? `Owner note: ${note}.` : "",
      "No readable text, logos, watermarks, fabricated proof, staff, customers, awards, reviews, or results.",
    ].filter(Boolean).join(" ");
    return { prompt };
  }, [shot, note]);

  const generate = async (count: number) => {
    if (!organizationId || !shot) return;
    setBusy(true);
    let blocked = false;

    for (let option = 0; option < count; option += 1) {
      try {
        const result = await generateStudioImage({
          data: {
            organizationId,
            prompt: `${brief?.prompt ?? ""} Distinct commissioned variation ${option + 1}.`,
            altText: shot.altText,
            category: shot.slot === "hero" ? "hero" : shot.slot === "about" ? "team" : "work",
            label: `${shot.slot}-${option + 1}`,
            aspectRatio,
          },
        });

        if (result.ok && result.path) {
          setCandidates((current) => [
            {
              id: `${option}-${Date.now()}`,
              styleLabel: `AI direction ${option + 1}`,
              preview: result.preview ?? result.path!,
              path: result.path!,
            },
            ...current,
          ]);
        } else {
          if (result.blocked) blocked = true;
          toast.error(result.message ?? "Couldn't create that image.");
          if (result.blocked) break;
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't create that image.");
        break;
      }
    }

    setBusy(false);
    void queryClient.invalidateQueries({ queryKey: ["media", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["score-facts", organizationId] });
    if (!blocked) toast.success("Options ready — pick the one you want.");
  };

  /**
   * Fills an empty photo library automatically: one image for each shot this
   * website needs, in the business's own visual language. Clients replace these
   * with their own photos whenever they like — nothing is overwritten.
   */
  const generateStarterSet = async () => {
    if (!organizationId) return;
    setBusy(true);
    for (const entry of shots) {
      const imageBrief = [entry.subject, entry.purpose, entry.environment, entry.action, entry.lighting,
        entry.camera, entry.framing, entry.mood, entry.palette, entry.mobileCrop, ...entry.constraints,
        "No readable text, logos, watermarks, fabricated proof, staff, customers, awards, reviews, or results."].join(". ");
      try {
        const result = await generateStudioImage({
          data: {
            organizationId,
            prompt: imageBrief,
            altText: entry.altText,
            category: entry.slot === "hero" ? "hero" : entry.slot === "about" ? "team" : "work",
            label: `starter-${entry.slot}`,
            aspectRatio: entry.slot === "hero" ? "16:9" : "4:3",
          },
        });
        if (!result.ok) {
          toast.error(result.message ?? "Couldn't create that image.");
          if (result.blocked) break;
        } else if (result.path && entry.slot === "hero" && !hasHeroImage) {
          onSetHero?.(result.path);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't create that image.");
        break;
      }
    }
    setBusy(false);
    void queryClient.invalidateQueries({ queryKey: ["media", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["score-facts", organizationId] });
    toast.success("Starter photos added to your library.");
  };

  /**
   * Changes a picture the owner already has. The original stays in the library —
   * the changed version is saved alongside it, so nothing is lost and "try
   * again" is always safe.
   */
  const runChange = async (sourcePath: string) => {
    if (!organizationId || changeNote.trim().length < 3) return;
    setBusy(true);
    try {
      const result = await editStudioImage({
        data: {
          organizationId,
          sourcePath,
          change: changeNote.trim(),
          altText: shot?.altText ?? "",
          category: shot?.slot === "hero" ? "hero" : "work",
          label: `${shot?.slot ?? "image"}-changed`,
        },
      });
      if (result.ok && result.path) {
        setCandidates((current) => [
          {
            id: `changed-${Date.now()}`,
            styleLabel: "Changed",
            preview: result.preview ?? result.path!,
            path: result.path!,
          },
          ...current,
        ]);
        setChangeFor(null);
        setChangeNote("");
        toast.success("Changed picture saved next to the original.");
        void queryClient.invalidateQueries({ queryKey: ["media", organizationId] });
      } else {
        toast.error(result.message ?? "Couldn't change that picture.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't change that picture.");
    }
    setBusy(false);
  };

  return (
    <Panel className="p-5">
      <SectionHeading eyebrow="AI Image Studio" title="Create the photography your website needs" />
      <p className="mt-1.5 text-[13px] text-muted-foreground">
        Revora works out which images this website is missing, then shoots them in your own visual
        language authored for this exact site. Every
        image you keep goes into your photo library.
      </p>

      {mediaCount === 0 && canManage ? (
        <div className="mt-4 rounded-lg border border-primary/40 bg-primary/5 p-3.5">
          <p className="text-[13px] font-medium">No photos on your site yet</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Revora can fill your site with images made for your trade right now, so it never looks
            empty while you gather your own photos. Swap them for real job photos any time.
          </p>
          <Button
            type="button"
            variant="signal"
            size="sm"
            className="mt-2.5"
            disabled={busy}
            onClick={() => void generateStarterSet()}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Creating your photos…
              </>
            ) : (
              <>
                <Sparkles className="size-4" aria-hidden="true" /> Generate my starter photo set
              </>
            )}
          </Button>
        </div>
      ) : null}

      {status.data ? (
        <div
          className={cn(
            "mt-4 rounded-lg border p-3.5",
            status.data.available ? "border-border bg-elevated" : "border-amber-500/40 bg-amber-500/5",
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={status.data.available ? "signal" : "attention"}>
              {status.data.available ? "Picture making ready" : "Picture making unavailable"}
            </Pill>
            {status.data.available && status.data.remainingToday !== null ? (
              <span className="text-[12px] text-muted-foreground">
                {status.data.remainingToday} free pictures left today
              </span>
            ) : null}
            {status.data.available ? (
              <span className="text-[12px] text-muted-foreground">
                {status.data.editSupported
                  ? "New pictures and changes to existing pictures"
                  : "New pictures only — changing an existing picture isn't available"}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-[12.5px] text-muted-foreground">{status.data.message}</p>
        </div>
      ) : null}

      <div className="mt-4">
        <p className="text-[12px] uppercase tracking-wide text-muted-foreground">Shape</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {["16:9", "4:3", "1:1", "3:2", "21:9", "9:16"].map((ratio) => (
            <button
              key={ratio}
              type="button"
              onClick={() => setAspectRatio(ratio)}
              aria-pressed={aspectRatio === ratio}
              disabled={!canManage}
              className={cn(
                "cursor-pointer rounded-full border px-3 py-1.5 text-[12px] transition-all disabled:cursor-not-allowed disabled:opacity-60",
                aspectRatio === ratio
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:bg-elevated",
              )}
            >
              {ratio}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-elevated p-3.5">
        <p className="text-[12px] uppercase tracking-wide text-muted-foreground">
          Visual direction
        </p>
        <p className="mt-1 text-[13px]">Each shot below uses the saved AI campaign without preset styles.</p>
      </div>

      <p className="mt-5 text-[12px] uppercase tracking-wide text-muted-foreground">
        Shots this website needs
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {shots.map((entry, index) => (
          <button
            key={`${entry.slot}-${entry.label}-${index}`}
            type="button"
            onClick={() => {
              setShotIndex(index);
              setCandidates([]);
            }}
            aria-pressed={shotIndex === index}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1.5 text-[12px] transition-all",
              shotIndex === index
                ? "border-primary bg-primary/15 text-primary shadow-[0_0_0_1px_var(--primary)]"
                : "border-border text-muted-foreground hover:bg-elevated",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {shot ? (
        <div className="mt-4 space-y-3">
          <p className="text-[13px] text-muted-foreground">{shot.purpose}</p>

          <label className="block">
            <span className="text-[12px] uppercase tracking-wide text-muted-foreground">
              Anything specific? (optional)
            </span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 200))}
              placeholder="e.g. a black SUV outside a modern house"
              disabled={!canManage}
              className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
            />
          </label>

          {brief ? (
            <details className="rounded-lg border border-border bg-elevated p-3">
              <summary className="cursor-pointer text-[12px] text-muted-foreground">
                See the production brief Revora will use
              </summary>
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                {brief.prompt}
              </p>
            </details>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void generate(4)} disabled={!canManage || busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Creating options…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" aria-hidden="true" /> Create 4 options
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void generate(1)}
              disabled={!canManage || busy}
            >
              <Wand2 className="size-4" aria-hidden="true" /> Just one
            </Button>
          </div>

          {!canManage ? (
            <p className="text-[12px] text-muted-foreground">
              You have view-only access, so images can't be created here.
            </p>
          ) : null}
        </div>
      ) : null}

      {candidates.length ? (
        <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {candidates.map((candidate) => (
            <li
              key={candidate.id}
              className="overflow-hidden rounded-lg border border-border bg-elevated"
            >
              <img
                src={candidate.preview}
                alt={shot?.altText ?? "Generated website image"}
                loading="lazy"
                className="aspect-video w-full object-cover"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5">
                <Pill>{candidate.styleLabel}</Pill>
                <div className="flex flex-wrap items-center gap-2">
                  {onSetHero && shot?.slot === "hero" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onSetHero(candidate.path);
                        toast.success("Set as your hero image.");
                      }}
                    >
                      Use as hero
                    </Button>
                  ) : (
                    <span className="text-[12px] text-muted-foreground">Saved to your photos</span>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={!canManage || busy}
                    onClick={() => void generate(1)}
                  >
                    Try again
                  </Button>
                  {status.data?.editSupported ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={!canManage || busy}
                      onClick={() =>
                        setChangeFor((current) =>
                          current === candidate.path ? null : candidate.path,
                        )
                      }
                    >
                      Change this picture
                    </Button>
                  ) : null}
                </div>
              </div>
              {changeFor === candidate.path ? (
                <div className="border-t border-border p-2.5">
                  <label className="block">
                    <span className="text-[12px] uppercase tracking-wide text-muted-foreground">
                      What should change?
                    </span>
                    <input
                      value={changeNote}
                      onChange={(event) => setChangeNote(event.target.value.slice(0, 200))}
                      placeholder="e.g. same photo, at dusk with the lights on"
                      className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2"
                    disabled={busy || changeNote.trim().length < 3}
                    onClick={() => void runChange(candidate.path)}
                  >
                    {busy ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Changing…
                      </>
                    ) : (
                      <>
                        <Wand2 className="size-4" aria-hidden="true" /> Change it
                      </>
                    )}
                  </Button>
                  <p className="mt-1.5 text-[12px] text-muted-foreground">
                    The original stays in your photos — the changed version is saved next to it.
                  </p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
