import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Copy, ExternalLink, Hammer, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { draftDemoOutreach, listProspectDemoBuilds, startProspectDemoBuild, type DemoOutreachDraft } from "@/lib/jarvis-demo-site.functions";
import { pumpSiteEngineQueue } from "@/lib/site-engine.functions";

const EMPTY = { businessName: "", industry: "", city: "", state: "", phone: "", email: "", services: "", description: "" };
type Field = keyof typeof EMPTY;

const FIELDS: { key: Field; label: string; placeholder: string; required?: boolean }[] = [
  { key: "businessName", label: "Business name", placeholder: "Triangle Comfort HVAC", required: true },
  { key: "industry", label: "Trade or category", placeholder: "HVAC contractor", required: true },
  { key: "city", label: "City", placeholder: "Raleigh", required: true },
  { key: "state", label: "State", placeholder: "NC" },
  { key: "phone", label: "Phone (as listed publicly)", placeholder: "(919) 555-0142" },
  { key: "email", label: "Business email", placeholder: "owner@example.com" },
];

const ACTIVE = new Set(["queued", "processing"]);

/**
 * Jarvis panel: build a private demo website for a business with no website.
 * The build runs on the normal AI builder (free model pool, fact and safety
 * gates). Nothing is published or sent; the operator shares the preview link.
 */
export function ProspectDemoBuilder() {
  const qc = useQueryClient();
  const start = useServerFn(startProspectDemoBuild);
  const list = useServerFn(listProspectDemoBuilds);
  const pump = useServerFn(pumpSiteEngineQueue);
  const draftFn = useServerFn(draftDemoOutreach);
  const [form, setForm] = useState(EMPTY);
  const [drafts, setDrafts] = useState<Record<string, DemoOutreachDraft>>({});
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const drafting = useMutation({
    mutationFn: (organizationId: string) => draftFn({ data: { organizationId } }),
    onSuccess: (draft, organizationId) => {
      setDrafts((current) => ({ ...current, [organizationId]: draft }));
      setBodies((current) => ({ ...current, [organizationId]: draft.body }));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const demos = useQuery({
    queryKey: ["jarvis", "prospect-demos"],
    queryFn: () => list(),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((demo) => demo.build && ACTIVE.has(demo.build.status)) ? 5_000 : false,
  });

  // Keep active builds moving while this panel is open, even without a scheduler.
  const activeIds = (demos.data ?? [])
    .filter((demo) => demo.build && ACTIVE.has(demo.build.status))
    .map((demo) => demo.organizationId)
    .join(",");
  useEffect(() => {
    if (!activeIds) return;
    let stopped = false;
    const tick = async () => {
      for (const organizationId of activeIds.split(",")) {
        if (stopped) return;
        await pump({ data: { organizationId } }).catch(() => undefined);
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 20_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeIds, pump]);

  const building = useMutation({
    mutationFn: () => start({ data: form }),
    onSuccess: () => {
      toast.success("Demo build started. The AI team is writing the site now.");
      setForm(EMPTY);
      void qc.invalidateQueries({ queryKey: ["jarvis", "prospect-demos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const previewUrl = (token: string) =>
    typeof window === "undefined" ? `/p/${token}` : `${window.location.origin}/p/${token}`;

  return (
    <details className="rounded-xl border border-border bg-card" open>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium">
        <Hammer className="size-4" aria-hidden />
        Demo site builder · for businesses with no website
      </summary>
      <div className="space-y-3 border-t border-border p-3">
        <p className="text-xs text-muted-foreground">
          Enter only real, public facts about the business. Jarvis creates a private draft workspace and the AI team
          builds the site on your free model pool. Missing facts are left out, never invented. The site is not
          published; you get a private 30-day preview link to share.
        </p>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            building.mutate();
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={`demo-${field.key}`} className="text-xs">
                  {field.label}
                  {field.required ? " *" : ""}
                </Label>
                <Input
                  id={`demo-${field.key}`}
                  value={form[field.key]}
                  placeholder={field.placeholder}
                  required={field.required}
                  onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="demo-services" className="text-xs">Services (one per line or comma separated)</Label>
            <Textarea
              id="demo-services"
              rows={3}
              value={form.services}
              placeholder={"AC repair\nFurnace installation\nDuct cleaning"}
              onChange={(event) => setForm((current) => ({ ...current, services: event.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="demo-description" className="text-xs">What the business does (optional)</Label>
            <Textarea
              id="demo-description"
              rows={2}
              value={form.description}
              placeholder="Family-owned HVAC company serving Wake County homes since 2009."
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            />
          </div>
          <Button type="submit" size="sm" disabled={building.isPending}>
            {building.isPending ? "Starting build…" : "Build demo site"}
          </Button>
        </form>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Demo sites</h3>
          {demos.isLoading ? <p className="text-xs text-muted-foreground">Loading…</p> : null}
          {demos.error ? <p role="alert" className="text-xs text-destructive">Couldn't load demo sites: {demos.error.message}</p> : null}
          {demos.data && demos.data.length === 0 ? <p className="text-xs text-muted-foreground">No demo sites yet.</p> : null}
          {(demos.data ?? []).map((demo) => {
            const status = demo.build?.status ?? "not started";
            const done = status === "completed";
            return (
              <article key={demo.organizationId} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="min-w-0 truncate">{demo.name}</strong>
                  <span className="text-xs text-muted-foreground">
                    {demo.industry ?? ""} · {status}
                    {demo.build && ACTIVE.has(status) ? ` · ${demo.build.progress}%` : ""}
                  </span>
                </div>
                {demo.build && ACTIVE.has(status) ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${demo.name} build`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={demo.build.progress}>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, demo.build.progress))}%` }} />
                  </div>
                ) : null}
                {demo.build?.error && !done ? <p className="mt-1 break-words text-xs text-destructive">{demo.build.error}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <a className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-medium hover:bg-muted" href={`/p/${demo.previewToken}`} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-3.5" aria-hidden />Open preview
                  </a>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(previewUrl(demo.previewToken))
                        .then(() => toast.success("Preview link copied."), () => toast.error("Couldn't copy the link."));
                    }}
                  >
                    <Copy className="mr-1 size-3.5" />Copy link
                  </Button>
                  {done ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={drafting.isPending && drafting.variables === demo.organizationId}
                      onClick={() => drafting.mutate(demo.organizationId)}
                    >
                      <Mail className="mr-1 size-3.5" />
                      {drafting.isPending && drafting.variables === demo.organizationId
                        ? "Writing…"
                        : drafts[demo.organizationId]
                          ? "Rewrite email"
                          : "Write email"}
                    </Button>
                  ) : null}
                </div>
                {drafts[demo.organizationId] ? (() => {
                  const draft = drafts[demo.organizationId]!;
                  const body = bodies[demo.organizationId] ?? draft.body;
                  const blocked = !draft.mailingAddressConfigured;
                  return (
                    <div className="mt-3 space-y-2 rounded-md border border-border p-2">
                      <p className="text-xs text-muted-foreground">
                        To: {draft.email ?? "no business email on file, so copy the text and reach them another way"} ·{" "}
                        {draft.aiWritten ? "written by the free AI pool" : "AI unavailable, plain template used"}
                      </p>
                      <p className="text-sm font-medium">{draft.subject}</p>
                      <Textarea
                        rows={8}
                        value={body}
                        onChange={(event) => setBodies((current) => ({ ...current, [demo.organizationId]: event.target.value }))}
                      />
                      {blocked ? (
                        <p role="alert" className="text-xs text-destructive">
                          Set REVORA_MAILING_ADDRESS (a real street address or PO box) in your server secrets before sending. Commercial email must include it.
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {draft.email && !blocked ? (
                          <a
                            className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted"
                            href={`mailto:${draft.email}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(body)}`}
                          >
                            Send from my mail app
                          </a>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            void navigator.clipboard
                              .writeText(`${draft.subject}\n\n${body}`)
                              .then(() => toast.success("Email copied."), () => toast.error("Couldn't copy the email."));
                          }}
                        >
                          <Copy className="mr-1 size-3.5" />Copy email
                        </Button>
                      </div>
                    </div>
                  );
                })() : null}
              </article>
            );
          })}
        </div>
      </div>
    </details>
  );
}
