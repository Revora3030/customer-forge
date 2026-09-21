/**
 * Upgrade Studio — the builder's built-in scanner.
 *
 * It reads the client's live pages every time they load or change, works out
 * every elite upgrade the site is still missing, and lets the client tick as
 * many as they like and upload them all in one go. After a batch is applied the
 * scan re-runs automatically and the next tier of upgrades appears, so the list
 * keeps improving the site instead of running out. Nothing is ever removed or
 * downgraded, and a rollback point is saved before every batch.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { Check, History, Loader2, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { applyWebsiteChanges } from "@/lib/site-agent.functions";
import {
  chunkActions,
  scanForUpgrades,
  summarizeUpgrades,
  type EliteUpgrade,
  type StudioFacts,
} from "@/lib/upgrade-studio";
import type { ContentPage } from "@/lib/website-content";

const TIER_TONE: Record<EliteUpgrade["tier"], "info" | "signal" | "attention"> = {
  Conversion: "signal",
  Trust: "info",
  Search: "info",
  Local: "info",
  "Premium visuals": "attention",
  Structure: "signal",
};

export function UpgradeStudio({
  organizationId,
  canManage,
  pages,
  facts,
}: {
  organizationId: string | undefined;
  canManage: boolean;
  pages: ContentPage[];
  facts: StudioFacts;
}) {
  const queryClient = useQueryClient();
  const applyFn = useServerFn(applyWebsiteChanges);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [cycle, setCycle] = useState(0);

  const upgrades = useMemo(
    () => scanForUpgrades(pages, { ...facts, cycle }),
    [pages, facts, cycle],
  );
  const chosen = useMemo(
    () => upgrades.filter((upgrade) => !skipped.has(upgrade.id)),
    [upgrades, skipped],
  );
  const totals = summarizeUpgrades(chosen);

  const apply = useMutation({
    mutationFn: async (batch: EliteUpgrade[]) => {
      const actions = batch.flatMap((upgrade) => upgrade.actions);
      const chunks = chunkActions(actions);
      let applied = 0;
      let failed = 0;
      let label = "";
      for (const [index, chunk] of chunks.entries()) {
        const result = await applyFn({
          data: {
            organizationId: organizationId!,
            actions: chunk,
            label:
              `Before upgrade batch${chunks.length > 1 ? ` ${index + 1}/${chunks.length}` : ""}: ${batch[0]?.title ?? "site upgrades"}`.slice(
                0,
                110,
              ),
          },
        });
        applied += result.applied;
        failed += result.failed;
        label = result.snapshotLabel;
      }
      return { applied, failed, label, upgrades: batch.length };
    },
    onSuccess: (result) => {
      toast.success(
        `${result.upgrades} upgrade${result.upgrades === 1 ? "" : "s"} installed — ${result.applied} change${result.applied === 1 ? "" : "s"} written.` +
          (result.failed ? ` ${result.failed} skipped.` : ""),
        {
          description: `Rollback point saved as “${result.label}”. Scanning again for the next upgrades…`,
        },
      );
      setSkipped(new Set());
      setCycle((value) => value + 1);
      void queryClient.invalidateQueries({ queryKey: ["website_content", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["website-versions", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["score_facts", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["website_settings"] });
    },
    onError: (error: Error) =>
      toast.error(friendlyError(error, "Couldn't install those upgrades.")),
  });

  return (
    <Panel id="upgrade-studio" className="scroll-mt-24 border-primary/30 p-5">
      <SectionHeading
        eyebrow="Built in · Upgrade studio"
        title="Revora scans your site and keeps finding elite upgrades"
        action={
          <Pill tone="info">
            <Sparkles className="size-3" aria-hidden="true" /> {upgrades.length} found
          </Pill>
        }
      />
      <p className="mt-2 max-w-2xl text-[13px] text-muted-foreground">
        Every time your site changes, Revora re-reads all of your pages and works out what is still
        missing — closing asks, capture forms, proof, prices, answers, local pages, Google snippets
        and premium 3D visuals. Tick as many as you like and{" "}
        <span className="text-gold">upload them all in one go</span>. Nothing is ever deleted or
        watered down, and a rollback point is saved before every batch.
      </p>

      {!upgrades.length ? (
        <div className="mt-4 rounded-md border border-border bg-elevated/50 p-4 text-[13px] text-muted-foreground">
          <p className="font-medium text-foreground">Your site is running at full strength.</p>
          <p className="mt-1">
            Every upgrade Revora can install automatically is already in place. Add more services,
            photos or reviews and the scanner will unlock the next tier — or ask the assistant for
            anything custom.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3">
            {upgrades.map((upgrade) => {
              const off = skipped.has(upgrade.id);
              const expanded = open === upgrade.id;
              return (
                <div
                  key={upgrade.id}
                  className={`rounded-md border p-3.5 transition-opacity ${off ? "border-border opacity-50" : "border-border"}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={TIER_TONE[upgrade.tier]}>{upgrade.tier}</Pill>
                    <p className="min-w-0 text-[13px] font-medium">{upgrade.title}</p>
                    <span className="text-[11px] text-muted-foreground">
                      {upgrade.actions.length} change{upgrade.actions.length === 1 ? "" : "s"} · +
                      {upgrade.impact} pts
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12.5px] text-muted-foreground">{upgrade.why}</p>
                  {expanded ? (
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-muted-foreground">
                      {upgrade.preview.map((line, index) => (
                        <li key={`${upgrade.id}-${index}`}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-2.5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="cursor-pointer text-[12px] text-primary underline-offset-2 hover:underline"
                      onClick={() => setOpen(expanded ? null : upgrade.id)}
                    >
                      {expanded ? "Hide the exact changes" : "See the exact changes"}
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer text-[12px] text-muted-foreground underline-offset-2 hover:underline"
                      onClick={() =>
                        setSkipped((prior) => {
                          const next = new Set(prior);
                          if (next.has(upgrade.id)) next.delete(upgrade.id);
                          else next.add(upgrade.id);
                          return next;
                        })
                      }
                    >
                      {off ? "Include this upgrade" : "Skip this upgrade"}
                    </button>
                    <button
                      type="button"
                      disabled={!canManage || apply.isPending}
                      className="cursor-pointer text-[12px] text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => apply.mutate([upgrade])}
                    >
                      Install just this one
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-border pt-4">
            <Button
              variant="signal"
              disabled={!canManage || !chosen.length || apply.isPending}
              onClick={() => apply.mutate(chosen)}
            >
              {apply.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wand2 className="size-4" />
              )}
              Install {totals.count} upgrade{totals.count === 1 ? "" : "s"} ({totals.changes} change
              {totals.changes === 1 ? "" : "s"})
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={apply.isPending}
              onClick={() => setSkipped(new Set())}
            >
              <Check className="size-4" /> Select all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={apply.isPending}
              onClick={() => {
                setCycle((value) => value + 1);
                void queryClient.invalidateQueries({
                  queryKey: ["website_content", organizationId],
                });
                void queryClient.invalidateQueries({ queryKey: ["score_facts", organizationId] });
                toast.success("Re-scanning your site for new upgrades.");
              }}
            >
              <RefreshCw className="size-4" /> Scan again
            </Button>
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <History className="size-3.5" aria-hidden="true" /> Rollback point saved before every
              batch · +{totals.impact} growth points available
            </span>
          </div>
        </>
      )}
    </Panel>
  );
}
