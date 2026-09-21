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
import {
  CANDIDATE_STYLES,
  REFINEMENTS,
  altTextFor,
  buildImageBrief,
  pickVisualDirection,
  planShots,
  type PlannedShot,
  type RefinementId,
} from "@/lib/visual-direction";

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
  industry,
  city,
  primaryColor,
  accentColor,
  services,
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
  mediaCount: number;
  hasHeroImage: boolean;
  onSetHero?: (path: string) => void;
}) {
  const queryClient = useQueryClient();
  const direction = useMemo(
    () => pickVisualDirection({ industry: industry ?? null, services }),
    [industry, services],
  );
  const shots = useMemo(
    () =>
      planShots({
        direction,
        serviceNames: services.map((s) => s.name),
        hasHeroImage,
        mediaCount,
      }),
    [direction, services, hasHeroImage, mediaCount],
  );

  const [shotIndex, setShotIndex] = useState(0);
  const [refinements, setRefinements] = useState<RefinementId[]>([]);
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

  const shot: PlannedShot | undefined = shots[shotIndex];

  const brief = useMemo(() => {
    if (!shot) return null;
    return buildImageBrief({
      direction,
      shot,
      style: CANDIDATE_STYLES[0]!,
      businessName: businessName ?? null,
      city: city ?? null,
      primaryColor: primaryColor ?? null,
      accentColor: accentColor ?? null,
      refinements,
      extra: note || null,
    });
  }, [direction, shot, businessName, city, primaryColor, accentColor, refinements, note]);

  const toggleRefinement = (id: RefinementId) =>
    setRefinements((current) =>
      current.includes(id) ? current.filter((r) => r !== id) : [...current, id],
    );

  const generate = async (count: number) => {
    if (!organizationId || !shot) return;
    setBusy(true);
    const styles = CANDIDATE_STYLES.slice(0, count);
    let blocked = false;

    for (const style of styles) {
      const imageBrief = buildImageBrief({
        direction,
        shot,
        style,
        businessName: businessName ?? null,
        city: city ?? null,
        primaryColor: primaryColor ?? null,
        accentColor: accentColor ?? null,
        refinements,
        extra: note || null,
      });

      try {
        const result = await generateStudioImage({
          data: {
            organizationId,
            prompt: imageBrief.prompt,
            altText: altTextFor(shot, businessName),
            category: shot.slot === "hero" ? "hero" : shot.slot === "about" ? "team" : "work",
            label: `${shot.slot}-${style.id}`,
            aspectRatio,
          },
        });

        if (result.ok && result.path) {
          setCandidates((current) => [
            {
              id: `${style.id}-${Date.now()}`,
              styleLabel: style.label,
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
    const style = CANDIDATE_STYLES[0]!;
    for (const entry of shots.slice(0, 3)) {
      const imageBrief = buildImageBrief({
        direction,
        shot: entry,
        style,
        businessName: businessName ?? null,
        city: city ?? null,
        primaryColor: primaryColor ?? null,
        accentColor: accentColor ?? null,
        refinements: [],
        extra: null,
      });
      try {
        const result = await generateStudioImage({
          data: {
            organizationId,
            prompt: imageBrief.prompt,
            altText: altTextFor(entry, businessName),
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
          altText: shot ? altTextFor(shot, businessName) : "",
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
        language — <span className="text-primary">{direction.label.toLowerCase()}</span>. Every
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
        <p className="mt-1 text-[13px]">{direction.language}.</p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Lighting: {direction.lighting} · Environment: {direction.environment}
        </p>
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

          <div>
            <p className="text-[12px] uppercase tracking-wide text-muted-foreground">Adjustments</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {REFINEMENTS.map((refinement) => {
                const active = refinements.includes(refinement.id);
                return (
                  <button
                    key={refinement.id}
                    type="button"
                    onClick={() => toggleRefinement(refinement.id)}
                    aria-pressed={active}
                    disabled={!canManage}
                    className={cn(
                      "cursor-pointer rounded-full border px-3 py-1.5 text-[12px] transition-all disabled:cursor-not-allowed disabled:opacity-60",
                      active
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:bg-elevated",
                    )}
                  >
                    {refinement.label}
                  </button>
                );
              })}
            </div>
          </div>

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
                alt={shot ? altTextFor(shot, businessName) : "Generated website image"}
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
