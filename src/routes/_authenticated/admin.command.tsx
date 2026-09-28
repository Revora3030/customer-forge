import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorNote, LoadingRows, Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  getCommandCenter,
  getSiteDesign,
  saveCommandSettings,
  saveSiteDesign,
} from "@/lib/ai/command-center.functions";
import type { DesignTokens } from "@/lib/builder/design-tokens";
import { metaDescription } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/admin/command")({
  head: () => ({
    meta: [
      { title: "AI Command Center — Revora admin" },
      { name: "description", content: metaDescription("Live model routing, site design tokens and the visual QA gate for every Revora website.") },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CommandCenter,
});

type Settings = { pinnedModels: string[]; pausedModels: string[]; qaAutoRevert: boolean; qaMinScore: number };

function CommandCenter() {
  const load = useServerFn(getCommandCenter);
  const query = useQuery({ queryKey: ["admin-command"], queryFn: () => load() });
  return (
    <div className="product-page space-y-6">
      <SectionHeading
        title="AI Command Center"
        description="Steer which models do the work, set any website's design tokens, and decide how strict the visual check is. Changes take effect within 30 seconds."
      />
      {query.error ? <ErrorNote message={(query.error as Error).message} /> : null}
      {query.isLoading || !query.data ? (
        <LoadingRows rows={6} />
      ) : (
        <>
          <RoutingAndGate initial={query.data.settings} models={query.data.models} />
          <SiteDesign orgs={query.data.orgs} />
        </>
      )}
    </div>
  );
}

function RoutingAndGate({
  initial,
  models,
}: {
  initial: Settings;
  models: { model: string; provider: string; calls: number; failures: number; quality: number }[];
}) {
  const save = useServerFn(saveCommandSettings);
  const qc = useQueryClient();
  const [s, setS] = useState<Settings>(initial);
  const mutation = useMutation({
    mutationFn: (next: Settings) => save({ data: next }),
    onSuccess: () => {
      toast.success("AI settings saved — live within 30 seconds.");
      void qc.invalidateQueries({ queryKey: ["admin-command"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = (list: "pinnedModels" | "pausedModels", model: string) =>
    setS((prev) => {
      const other = list === "pinnedModels" ? "pausedModels" : "pinnedModels";
      const on = prev[list].includes(model);
      return {
        ...prev,
        [list]: on ? prev[list].filter((m) => m !== model) : [...prev[list], model],
        [other]: prev[other].filter((m) => m !== model),
      };
    });

  return (
    <>
      <Panel>
        <h2 className="text-lg font-semibold">Live model routing</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pinned models are tried first, in the order you pin them. Paused models are skipped, unless every option is paused.
          This applies to text and planning work; picture generation keeps its quality ranking.
        </p>
        <ul className="mt-4 divide-y divide-border">
          {models.map((m) => {
            const pinIndex = s.pinnedModels.indexOf(m.model);
            const paused = s.pausedModels.includes(m.model);
            const rate = m.calls ? Math.round(((m.calls - m.failures) / m.calls) * 100) : null;
            return (
              <li key={m.model} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm">{m.model}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.provider || "provider"} · quality {m.quality} · {m.calls} calls in 7 days
                    {rate !== null ? ` · ${rate}% succeeded` : ""}
                  </p>
                </div>
                {pinIndex >= 0 ? <Pill tone="signal">Pinned #{pinIndex + 1}</Pill> : null}
                {paused ? <Pill tone="attention">Paused</Pill> : null}
                <Button size="sm" variant={pinIndex >= 0 ? "default" : "outline"} onClick={() => toggle("pinnedModels", m.model)}>
                  {pinIndex >= 0 ? "Unpin" : "Pin"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggle("pausedModels", m.model)}>
                  {paused ? "Resume" : "Pause"}
                </Button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel>
        <h2 className="text-lg font-semibold">Visual QA gate</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          After every chat change, Revora checks phone, tablet and desktop. When the AI can't repair a failure and the score stays
          below this line, the change is undone automatically.
        </p>
        <div className="mt-4 flex items-center justify-between gap-4">
          <Label htmlFor="qa-revert">Undo clearly-worse changes automatically</Label>
          <Switch id="qa-revert" checked={s.qaAutoRevert} onCheckedChange={(v) => setS({ ...s, qaAutoRevert: v })} />
        </div>
        <div className="mt-5">
          <Label>Minimum score to keep a change: {s.qaMinScore}/100</Label>
          <Slider className="mt-3" min={0} max={100} step={5} value={[s.qaMinScore]} onValueChange={([v]) => setS({ ...s, qaMinScore: v ?? 70 })} />
        </div>
      </Panel>

      <div className="flex justify-end">
        <Button onClick={() => mutation.mutate(s)} disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save routing and QA gate"}
        </Button>
      </div>
    </>
  );
}

function SiteDesign({ orgs }: { orgs: { id: string; name: string; slug: string }[] }) {
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? "");
  const load = useServerFn(getSiteDesign);
  const save = useServerFn(saveSiteDesign);
  const design = useQuery({ queryKey: ["admin-site-design", orgId], queryFn: () => load({ data: { organizationId: orgId } }), enabled: !!orgId });
  const [colors, setColors] = useState<Record<string, string>>({});
  const [tokens, setTokens] = useState<DesignTokens>({});
  useEffect(() => {
    if (!design.data) return;
    const c = design.data.colors;
    setColors({ primary_color: c.primary_color ?? "", secondary_color: c.secondary_color ?? "", accent_color: c.accent_color ?? "" });
    setTokens(design.data.tokens);
  }, [design.data]);
  const mutation = useMutation({
    mutationFn: () => save({ data: { organizationId: orgId, colors, tokens } }),
    onSuccess: () => toast.success("Design saved to that website."),
    onError: (e: Error) => toast.error(e.message),
  });
  const num = (key: keyof DesignTokens, label: string, min: number, max: number, step: number) => (
    <div>
      <Label>{label}: {String(tokens[key] ?? "not set")}</Label>
      <Slider className="mt-3" min={min} max={max} step={step} value={[Number(tokens[key] ?? min)]} onValueChange={([v]) => setTokens({ ...tokens, [key]: v })} />
    </div>
  );

  return (
    <Panel>
      <h2 className="text-lg font-semibold">Website design tokens</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The same controls the AI uses. Pick a website, adjust, and save. The customer's chat AI can keep refining from here.
      </p>
      <select
        aria-label="Website"
        className="mt-4 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={orgId}
        onChange={(e) => setOrgId(e.target.value)}
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>{o.name} ({o.slug})</option>
        ))}
      </select>
      {design.isLoading ? <LoadingRows rows={3} /> : (
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {(["primary_color", "secondary_color", "accent_color"] as const).map((key) => (
            <div key={key}>
              <Label htmlFor={key}>{key === "primary_color" ? "Action colour" : key === "secondary_color" ? "Page background" : "Accent"}</Label>
              <div className="mt-2 flex gap-2">
                <input
                  type="color"
                  aria-label={`${key} picker`}
                  className="h-10 w-12 rounded-md border border-input bg-background"
                  value={/^#[0-9a-f]{6}$/i.test(colors[key] ?? "") ? colors[key] : "#000000"}
                  onChange={(e) => setColors({ ...colors, [key]: e.target.value })}
                />
                <Input id={key} value={colors[key] ?? ""} placeholder="#RRGGBB" onChange={(e) => setColors({ ...colors, [key]: e.target.value })} />
              </div>
            </div>
          ))}
          {num("radius", "Corner radius (px)", 0, 40, 1)}
          {num("buttonRadius", "Button radius (px)", 0, 48, 1)}
          {num("space", "Section spacing", 0.6, 1.6, 0.05)}
          <div>
            <Label htmlFor="shadow">Card depth</Label>
            <select
              id="shadow"
              className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={tokens.shadow ?? ""}
              onChange={(e) => setTokens({ ...tokens, ...(e.target.value ? { shadow: e.target.value as NonNullable<DesignTokens["shadow"]> } : {}) })}
            >
              <option value="">Not set</option>
              <option value="none">None</option>
              <option value="subtle">Subtle</option>
              <option value="medium">Medium</option>
              <option value="strong">Strong</option>
            </select>
          </div>
        </div>
      )}
      <div className="mt-5 flex justify-end">
        <Button onClick={() => mutation.mutate()} disabled={!orgId || mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save design"}
        </Button>
      </div>
    </Panel>
  );
}
