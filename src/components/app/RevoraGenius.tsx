/**
 * Revora Genius — the proactive brain on the website builder page.
 *
 * The client should not have to know what to ask for. This panel reads their
 * live pages and business facts and offers five ways in:
 *
 *  · Hidden gems      — features they didn't know a website could have
 *  · What I'm missing — an audit across conversion, content, UX, mobile, SEO,
 *                       accessibility, speed and growth
 *  · Think ahead      — the next few moves, in order, with the reason
 *  · Show me options  — several complete design identities to choose from
 *  · Surprise me      — creative, business-specific ideas
 *
 * Every "Build it" writes only validated builder actions, snapshots a rollback
 * point first, and never deletes or downgrades anything. Anything the builder
 * cannot write directly is handed to the Website Assistant (which plans it with
 * the client) or linked to the part of Revora where it already lives — never
 * presented as something it is not.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import {
  ArrowRight,
  Gem,
  Layers,
  Lightbulb,
  Loader2,
  Palette,
  Search,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { askAssistant } from "@/lib/assistant-bridge";
import { applyWebsiteChanges } from "@/lib/site-agent.functions";
import { chunkActions } from "@/lib/upgrade-studio";
import type { AgentAction } from "@/lib/site-agent";
import type { ContentPage } from "@/lib/website-content";
import {
  findGaps,
  suggestGems,
  surpriseIdeas,
  thinkAhead,
  type GemFacts,
  type HiddenGem,
  type SiteGap,
} from "@/lib/hidden-gems";
import { directionActions, directionPreview, recommendDirections } from "@/lib/design-directions";

type TabKey = "gems" | "missing" | "ahead" | "options" | "surprise";

const TABS: { key: TabKey; label: string; hint: string; icon: typeof Gem }[] = [
  {
    key: "gems",
    label: "Hidden gems",
    hint: "Things you didn't know your site could do",
    icon: Gem,
  },
  {
    key: "missing",
    label: "Find what I'm missing",
    hint: "Full audit of your live pages",
    icon: Search,
  },
  {
    key: "ahead",
    label: "Let Revora think ahead",
    hint: "Your next moves, in order",
    icon: Lightbulb,
  },
  {
    key: "options",
    label: "Show me options",
    hint: "Different designs, not one template",
    icon: Palette,
  },
  { key: "surprise", label: "Surprise me", hint: "Creative ideas for your trade", icon: Sparkles },
];

const SEVERITY_TONE: Record<SiteGap["severity"], "attention" | "signal" | "info"> = {
  high: "attention",
  medium: "signal",
  low: "info",
};

export function RevoraGenius({
  organizationId,
  canManage,
  pages,
  facts,
}: {
  organizationId: string | undefined;
  canManage: boolean;
  pages: ContentPage[];
  facts: GemFacts;
}) {
  const queryClient = useQueryClient();
  const applyFn = useServerFn(applyWebsiteChanges);
  const [tab, setTab] = useState<TabKey>("gems");
  const [open, setOpen] = useState<string | null>(null);
  const [shuffle, setShuffle] = useState(0);
  const [designShuffle, setDesignShuffle] = useState(0);
  const [tone, setTone] = useState<"any" | "light" | "dark">("any");

  const gems = useMemo(() => suggestGems(pages, facts), [pages, facts]);
  const gaps = useMemo(() => findGaps(pages, facts), [pages, facts]);
  const moves = useMemo(() => thinkAhead(pages, facts), [pages, facts]);
  const ideas = useMemo(() => surpriseIdeas(facts, shuffle), [facts, shuffle]);
  const directions = useMemo(
    () =>
      recommendDirections({
        businessName: facts.businessName,
        industry: facts.industry,
        services: facts.services,
        city: facts.city,
        count: 6,
        refresh: designShuffle,
        tone,
      }),
    [facts, designShuffle, tone],
  );
  const visibleSections = useMemo(
    () =>
      pages
        .filter((page) => page.is_visible)
        .reduce(
          (sum, page) => sum + page.sections.filter((section) => section.is_visible).length,
          0,
        ),
    [pages],
  );

  const apply = useMutation({
    mutationFn: async (input: { actions: AgentAction[]; label: string }) => {
      const chunks = chunkActions(input.actions);
      let applied = 0;
      let failed = 0;
      let snapshot = "";
      for (const [index, chunk] of chunks.entries()) {
        const result = await applyFn({
          data: {
            organizationId: organizationId!,
            actions: chunk,
            label:
              `Before: ${input.label}${chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ""}`.slice(
                0,
                110,
              ),
          },
        });
        applied += result.applied;
        failed += result.failed;
        snapshot = result.snapshotLabel;
      }
      return { applied, failed, snapshot };
    },
    onSuccess: (result) => {
      toast.success(
        `${result.applied} change${result.applied === 1 ? "" : "s"} written to your site.` +
          (result.failed ? ` ${result.failed} skipped.` : ""),
        {
          description: `Rollback point saved as “${result.snapshot}”. You can undo this at any time.`,
        },
      );
      void queryClient.invalidateQueries({ queryKey: ["website_content", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["website-versions", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["score_facts", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["business_profile", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["website_settings"] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't apply that yet.")),
  });

  const busy = apply.isPending;
  const gemById = (id: string | undefined) => (id ? gems.find((gem) => gem.id === id) : undefined);

  const buildGem = (gem: HiddenGem) => {
    if (gem.path === "install" && gem.actions?.length) {
      apply.mutate({ actions: gem.actions, label: gem.name });
      return;
    }
    if (gem.prompt) askAssistant(gem.prompt);
  };

  return (
    <Panel id="revora-genius" className="scroll-mt-24 border-primary/40 p-5">
      <SectionHeading
        eyebrow="Revora genius · Always on"
        title="You don't need to know what to ask — Revora already knows"
        action={
          <Pill tone="signal">
            <Sparkles className="size-3" aria-hidden="true" /> {gems.length + gaps.length} ideas
            ready
          </Pill>
        }
      />
      <p className="mt-2 max-w-2xl text-[13px] text-muted-foreground">
        Revora reads your live pages like a designer, developer, copywriter and conversion
        specialist at once, then offers what your site is missing with the{" "}
        <span className="text-gold">reason, the exact preview and a build button</span>. Everything
        is added, never removed, and a rollback point is saved before each change.
      </p>

      <div
        className="mt-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        role="tablist"
        aria-label="Revora genius"
      >
        {TABS.map((entry) => {
          const Icon = entry.icon;
          const active = tab === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(entry.key)}
              className={`shrink-0 cursor-pointer rounded-md border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                active
                  ? "border-primary/60 bg-primary/10"
                  : "border-border hover:border-primary/40 hover:bg-elevated"
              }`}
            >
              <span
                className={`flex items-center gap-1.5 text-[12.5px] font-medium ${active ? "text-primary" : ""}`}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {entry.label}
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{entry.hint}</span>
            </button>
          );
        })}
      </div>

      {tab === "gems" ? (
        <div className="mt-4 grid gap-3">
          {gems.map((gem) => {
            const expanded = open === gem.id;
            return (
              <div key={gem.id} className="rounded-md border border-border p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill
                    tone={
                      gem.path === "install"
                        ? "signal"
                        : gem.path === "system"
                          ? "info"
                          : "attention"
                    }
                  >
                    {gem.category}
                  </Pill>
                  <p className="min-w-0 text-[13px] font-medium">{gem.name}</p>
                  <span className="text-[11px] text-muted-foreground">
                    {gem.path === "install"
                      ? `${gem.actions?.length ?? 0} change${(gem.actions?.length ?? 0) === 1 ? "" : "s"} · builds now`
                      : gem.path === "system"
                        ? "already in your Revora system"
                        : "assistant plans it with you"}
                  </span>
                </div>
                <p className="mt-1.5 text-[12.5px] text-muted-foreground">{gem.why}</p>
                {expanded ? (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-muted-foreground">
                    {gem.preview.map((line, index) => (
                      <li key={`${gem.id}-${index}`}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-2.5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="cursor-pointer text-[12px] text-primary underline-offset-2 hover:underline"
                    onClick={() => setOpen(expanded ? null : gem.id)}
                  >
                    {expanded ? "Hide the preview" : "Preview it"}
                  </button>
                  {gem.path === "system" && gem.route ? (
                    <Link
                      to={gem.route}
                      className="text-[12px] text-primary underline-offset-2 hover:underline"
                    >
                      {gem.routeLabel ?? "Open it"}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={!canManage || busy}
                      onClick={() => buildGem(gem)}
                      className="cursor-pointer text-[12px] font-medium text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {gem.path === "install" ? "Build it now" : "Plan it with the assistant"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {tab === "missing" ? (
        <div className="mt-4 grid gap-3">
          {!gaps.length ? (
            <p className="rounded-md border border-border bg-elevated/50 p-4 text-[13px] text-muted-foreground">
              Nothing is missing that Revora can detect. Add services, photos or reviews and this
              audit will find the next level.
            </p>
          ) : null}
          {gaps.map((gap) => {
            const gem = gemById(gap.gemId);
            return (
              <div key={gap.id} className="rounded-md border border-border p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={SEVERITY_TONE[gap.severity]}>{gap.area}</Pill>
                  <p className="min-w-0 text-[13px] font-medium">{gap.title}</p>
                </div>
                <p className="mt-1.5 text-[12.5px] text-muted-foreground">{gap.detail}</p>
                <div className="mt-2.5">
                  {gem ? (
                    gem.path === "system" && gem.route ? (
                      <Link
                        to={gem.route}
                        className="text-[12px] text-primary underline-offset-2 hover:underline"
                      >
                        {gem.routeLabel ?? "Open it"}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled={!canManage || busy}
                        onClick={() => buildGem(gem)}
                        className="cursor-pointer text-[12px] font-medium text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {gem.path === "install"
                          ? `Fix it now — ${gem.name.toLowerCase()}`
                          : "Plan the fix with the assistant"}
                      </button>
                    )
                  ) : gap.prompt ? (
                    <button
                      type="button"
                      className="cursor-pointer text-[12px] font-medium text-primary underline-offset-2 hover:underline"
                      onClick={() => askAssistant(gap.prompt!)}
                    >
                      Ask Revora to fix this
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {tab === "ahead" ? (
        <ol className="mt-4 grid gap-3">
          {moves.map((move, index) => {
            const gem = gemById(move.gemId);
            return (
              <li key={move.id} className="rounded-md border border-border p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="info">Step {index + 1}</Pill>
                  <p className="min-w-0 text-[13px] font-medium">{move.title}</p>
                </div>
                <p className="mt-1.5 text-[12.5px] text-muted-foreground">{move.reason}</p>
                <div className="mt-2.5">
                  {gem && gem.path === "install" ? (
                    <button
                      type="button"
                      disabled={!canManage || busy}
                      onClick={() => buildGem(gem)}
                      className="cursor-pointer text-[12px] font-medium text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Do this now
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="cursor-pointer text-[12px] font-medium text-primary underline-offset-2 hover:underline"
                      onClick={() => askAssistant(move.prompt ?? gem?.prompt ?? move.title)}
                    >
                      Hand this to the assistant
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}

      {tab === "options" ? (
        <div className="mt-4 space-y-3">
          <p className="text-[12.5px] text-muted-foreground">
            Six complete identities built for{" "}
            <span className="text-foreground">{facts.businessName ?? "your business"}</span>
            {facts.industry ? ` (${facts.industry})` : ""} — colours, type, background and motion
            together. Every Revora client gets a different starting set, so no two sites look alike.
            Installing one is reversible.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { key: "any", label: "Any style" },
                { key: "light", label: "White / light sites" },
                { key: "dark", label: "Dark sites" },
              ] as const
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={tone === option.key}
                onClick={() => setTone(option.key)}
                className={`cursor-pointer rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                  tone === option.key
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-elevated"
                }`}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDesignShuffle((value) => value + 1)}
              className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-elevated"
            >
              Show me a fresh set
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {directions.map((direction) => (
              <div key={direction.id} className="rounded-md border border-border p-3.5">
                <div className="flex items-center gap-2">
                  <span className="flex gap-1" aria-hidden="true">
                    {[direction.primary, direction.accent, direction.secondary].map((colour) => (
                      <span
                        key={colour}
                        className="size-4 rounded-full border border-border"
                        style={{ backgroundColor: colour }}
                      />
                    ))}
                  </span>
                  <p className="text-[13px] font-medium">{direction.name}</p>
                </div>
                <p className="mt-1.5 text-[12.5px] text-muted-foreground">{direction.mood}</p>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  Best for: {direction.bestFor}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-[11.5px] text-muted-foreground">
                  {directionPreview(direction, visibleSections).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <div className="mt-2.5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={!canManage || busy || !pages.length}
                    onClick={() =>
                      apply.mutate({
                        actions: directionActions(direction, pages),
                        label: `${direction.name} design direction`,
                      })
                    }
                    className="cursor-pointer text-[12px] font-medium text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Use this design
                  </button>
                  <button
                    type="button"
                    className="cursor-pointer text-[12px] text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() =>
                      askAssistant(
                        `Show me a "${direction.name}" version of my homepage — ${direction.mood} Give me two different hero layouts and headline options to choose from.`,
                      )
                    }
                  >
                    Show me layouts in this style
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              askAssistant(
                "Give me three different versions of my homepage: layout, hero, headline, buttons and colours. Explain which customer each one is aimed at.",
              )
            }
          >
            <Layers className="size-4" /> Generate more versions with the assistant
          </Button>
        </div>
      ) : null}

      {tab === "surprise" ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {ideas.map((idea) => (
              <div key={idea.id} className="rounded-md border border-border p-3.5">
                <p className="text-[13px] font-medium">{idea.title}</p>
                <p className="mt-1.5 text-[12.5px] text-muted-foreground">{idea.pitch}</p>
                <button
                  type="button"
                  className="mt-2.5 cursor-pointer text-[12px] font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() => askAssistant(idea.prompt)}
                >
                  Build this idea <ArrowRight className="inline size-3" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setShuffle((value) => value + 1)}>
              <Wand2 className="size-4" /> Surprise me again
            </Button>
            <Button
              variant="signal"
              size="sm"
              onClick={() =>
                askAssistant(
                  "I have an idea for my website — ask me what I want and then build it step by step.",
                )
              }
            >
              <Sparkles className="size-4" /> Describe your own idea
            </Button>
          </div>
        </div>
      ) : null}

      {busy ? (
        <p className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Writing your changes and
          saving a rollback point…
        </p>
      ) : null}
      {!canManage ? (
        <p className="mt-3 text-[12px] text-muted-foreground">
          You have view-only access, so building is disabled. Ask an owner or admin to apply these.
        </p>
      ) : null}
    </Panel>
  );
}
