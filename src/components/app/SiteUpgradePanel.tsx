/**
 * Whole-site upgrades: movement, the story across pages, and a one-sentence
 * redesign that reaches every page at once.
 *
 * Nothing here writes wording, prices or any business fact — only design
 * choices and links between the owner's own pages. Every action saves a
 * restore point first, so anything can be undone from the version history.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Loader2, Sparkles, Undo2, Waves } from "lucide-react";
import { toast } from "@/lib/ui/notify";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  applyMotionPack,
  applySiteWideRedesign,
  applyStoryPass,
  undoSiteUpgrade,
  type RedesignResult,
  type SiteUpgradeUndo,
  type StoryPassResult,
} from "@/lib/site-upgrade.functions";
import { friendlyError } from "@/lib/user-error";

type Busy = null | "motion" | "story" | "story-write" | "redesign" | "undo";

const MOTION_CHOICES: { id: "none" | "subtle" | "expressive"; label: string; hint: string }[] = [
  { id: "none", label: "Still", hint: "Nothing moves — the calmest and fastest." },
  { id: "subtle", label: "Gentle", hint: "Blocks fade up softly as visitors scroll." },
  { id: "expressive", label: "Lively", hint: "Blocks rise, drift and catch the light." },
];

export function SiteUpgradePanel({
  organizationId,
  canManage,
  onRefresh,
}: {
  organizationId: string | undefined;
  canManage: boolean;
  onRefresh?: () => Promise<void> | void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<Busy>(null);
  const [motionNote, setMotionNote] = useState<string | null>(null);
  const [story, setStory] = useState<StoryPassResult | null>(null);
  const [redesign, setRedesign] = useState<RedesignResult | null>(null);
  const [wish, setWish] = useState("");
  const [undo, setUndo] = useState<{ label: string; undo: SiteUpgradeUndo } | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["website_content", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["website_settings", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["website_versions", organizationId] });
    void onRefresh?.();
  };

  const runMotion = async (intensity: "none" | "subtle" | "expressive") => {
    if (!organizationId || busy) return;
    setBusy("motion");
    try {
      const result = await applyMotionPack({ data: { organizationId, intensity } });
      setMotionNote(result.summary);
      setUndo(result.undo ? { label: "movement change", undo: result.undo } : null);
      refresh();
      toast.success(result.changed > 0 ? result.summary : "Movement already matched that setting.");
    } catch (error) {
      toast.error(friendlyError(error, "Movement couldn't be changed."));
    } finally {
      setBusy(null);
    }
  };

  const runStory = async (write: boolean) => {
    if (!organizationId || busy) return;
    setBusy(write ? "story-write" : "story");
    try {
      const result = await applyStoryPass({ data: { organizationId, write } });
      setStory(result);
      if (write) {
        refresh();
        toast.success(
          result.linksWritten > 0
            ? `${result.linksWritten} next-step link${result.linksWritten === 1 ? "" : "s"} added.`
            : "Every page already points the visitor onward.",
        );
      }
    } catch (error) {
      toast.error(friendlyError(error, "The page-by-page review couldn't run."));
    } finally {
      setBusy(null);
    }
  };

  const runRedesign = async () => {
    if (!organizationId || busy || wish.trim().length === 0) return;
    setBusy("redesign");
    try {
      const result = await applySiteWideRedesign({ data: { organizationId, instruction: wish } });
      setRedesign(result);
      setUndo(result.undo ? { label: "redesign", undo: result.undo } : null);
      if (result.understood) refresh();
      if (!result.understood) toast.error(result.summary);
      else toast.success(result.summary);
    } catch (error) {
      toast.error(friendlyError(error, "The redesign couldn't be applied."));
    } finally {
      setBusy(null);
    }
  };

  const putItBack = async () => {
    if (!organizationId || !undo || busy) return;
    setBusy("undo");
    try {
      const outcome = await undoSiteUpgrade({ data: { organizationId, undo: undo.undo } });
      setUndo(null);
      refresh();
      toast.success(outcome.summary);
    } catch (error) {
      toast.error(friendlyError(error, "That change couldn't be put back."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {undo && canManage ? (
        <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-[13px] text-muted-foreground">
            Not sure about the {undo.label}? Look at your site, then keep it or put it straight back.
          </p>
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void putItBack()}>
            {busy === "undo" ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
            Put it back
          </Button>
        </Panel>
      ) : null}
      <Panel className="p-5">
        <SectionHeading eyebrow="Movement" title="How your site moves" />
        <p className="mt-2 max-w-xl text-[13px] text-muted-foreground">
          One coherent setting for the whole site. Visitors who ask their device for less movement
          never see any of it.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {MOTION_CHOICES.map((choice) => (
            <Button
              key={choice.id}
              variant="outline"
              size="sm"
              disabled={!canManage || busy !== null}
              onClick={() => void runMotion(choice.id)}
              title={choice.hint}
            >
              {busy === "motion" ? <Loader2 className="size-4 animate-spin" /> : <Waves className="size-4" />}
              {choice.label}
            </Button>
          ))}
        </div>
        {motionNote ? (
          <p className="mt-3 text-[12px] text-muted-foreground" role="status">
            {motionNote}
          </p>
        ) : null}
      </Panel>

      <Panel className="p-5">
        <SectionHeading eyebrow="Story across pages" title="Does your site read as one journey?" />
        <p className="mt-2 max-w-xl text-[13px] text-muted-foreground">
          Revora reads every page together, puts them in the order a visitor should travel, and can
          add the next-step link at the foot of each one.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void runStory(false)}>
            {busy === "story" ? <Loader2 className="size-4 animate-spin" /> : <ArrowRightLeft className="size-4" />}
            Check the journey
          </Button>
          {canManage && story && story.order.length > 1 ? (
            <Button size="sm" disabled={busy !== null} onClick={() => void runStory(true)}>
              {busy === "story-write" ? <Loader2 className="size-4 animate-spin" /> : null}
              Add the next-step links
            </Button>
          ) : null}
        </div>
        {story ? (
          <div className="mt-4 space-y-2">
            <p className="text-[13px]">{story.summary}</p>
            {story.order.length > 0 ? (
              <ul className="space-y-1">
                {story.order.map((step) => (
                  <li key={step.slug} className="text-[12px] text-muted-foreground">
                    <span className="font-medium text-foreground">{step.title}</span> — {step.role}
                  </li>
                ))}
              </ul>
            ) : null}
            {story.findings.length > 0 ? (
              <div className="space-y-1">
                {story.findings.map((finding, index) => (
                  <p key={index} className="text-[12px] text-muted-foreground">
                    • {finding.detail}
                  </p>
                ))}
              </div>
            ) : (
              <Pill tone="signal">The journey has no gaps</Pill>
            )}
          </div>
        ) : null}
      </Panel>

      <Panel className="p-5">
        <SectionHeading eyebrow="Whole-site look" title="Change the feel in one sentence" />
        <p className="mt-2 max-w-xl text-[13px] text-muted-foreground">
          Try “make it feel more premium”, “calmer”, “bolder”, “more modern”, “warmer”, “editorial”,
          “playful” or “technical”. Your wording, prices and photos are never touched.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Input
            value={wish}
            onChange={(event) => setWish(event.target.value)}
            placeholder="make it feel more premium"
            aria-label="How should the whole site feel?"
            className="max-w-xs"
            disabled={!canManage || busy !== null}
          />
          <Button
            size="sm"
            disabled={!canManage || busy !== null || wish.trim().length === 0}
            onClick={() => void runRedesign()}
          >
            {busy === "redesign" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Apply to every page
          </Button>
        </div>
        {redesign ? (
          <div className="mt-4 space-y-2">
            <Pill tone={redesign.understood ? "signal" : "attention"}>
              {redesign.understood ? `Look: ${redesign.direction}` : "Not understood"}
            </Pill>
            <p className="text-[13px]">{redesign.summary}</p>
            {redesign.motionChanged > 0 ? (
              <p className="text-[12px] text-muted-foreground">
                Movement updated on {redesign.motionChanged} block
                {redesign.motionChanged === 1 ? "" : "s"} to match.
              </p>
            ) : null}
            {redesign.restorePointId ? (
              <p className="text-[12px] text-muted-foreground">
                A restore point was saved first — you can undo this from the version history.
              </p>
            ) : null}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
