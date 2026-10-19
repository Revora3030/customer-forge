import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Copy, Eye, ExternalLink, Hammer, ImageUp, Mail, MapPin, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  draftDemoOutreach,
  findProspectsFn,
  listProspectDemoBuilds,
  prospectFromImageFn,
  prospectFromMapsFn,
  startProspectDemoBuild,
  type DemoOutreachDraft,
} from "@/lib/jarvis-demo-site.functions";
import { prospectDemoInput, type FoundProspect } from "@/lib/prospect-finder";
import { pictureDataUrl } from "@/lib/picture-data-url";
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

type Prefill = Awaited<ReturnType<typeof prospectFromMapsFn>>;
type DemoList = Awaited<ReturnType<typeof listProspectDemoBuilds>>;

const pollWhileActive = (data: DemoList | undefined) =>
  (data ?? []).some((demo) => demo.build && ACTIVE.has(demo.build.status)) ? 5_000 : false;

/**
 * Keeps active demo builds moving, even without a scheduler: pumps each active
 * build's queue every 20s. Called by the Jarvis page so it runs while the page
 * is open, not only while the operations sheet happens to be mounted.
 */
export function useProspectDemoPump(enabled: boolean) {
  const list = useServerFn(listProspectDemoBuilds);
  const pump = useServerFn(pumpSiteEngineQueue);
  const demos = useQuery({
    queryKey: ["jarvis", "prospect-demos"],
    queryFn: () => list(),
    refetchInterval: (query) => pollWhileActive(query.state.data),
    enabled,
  });
  const activeIds = (demos.data ?? [])
    .filter((demo) => demo.build && ACTIVE.has(demo.build.status))
    .map((demo) => demo.organizationId)
    .join(",");
  useEffect(() => {
    if (!enabled || !activeIds) return;
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
  }, [activeIds, enabled, pump]);
}

/** A demo the Jarvis chat should follow in its live build card. */
export type DemoCardTarget = { organizationId: string; name: string; previewToken?: string | undefined };

type BuilderProps = {
  /** A build just started here; Jarvis shows its live build card in the chat. */
  onBuildStarted?: ((demo: DemoCardTarget) => void) | undefined;
  /** "Preview here": open this demo's build card / live preview in the chat. */
  onPreview?: ((demo: DemoCardTarget) => void) | undefined;
};

/**
 * Jarvis panel: build a private demo website for a business with no website.
 * The build runs on the normal AI builder (free model pool, fact and safety
 * gates). Nothing is published or sent from here; the operator shares the
 * preview link, or sends it from the chat's build card.
 */
export function ProspectDemoBuilder({ onBuildStarted, onPreview }: BuilderProps = {}) {
  const qc = useQueryClient();
  const start = useServerFn(startProspectDemoBuild);
  const list = useServerFn(listProspectDemoBuilds);
  const draftFn = useServerFn(draftDemoOutreach);
  const findFn = useServerFn(findProspectsFn);
  const [search, setSearch] = useState({ niche: "", city: "", state: "" });
  const [found, setFound] = useState<{ query: string; searched: number; prospects: FoundProspect[] } | null>(null);
  const [builtIds, setBuiltIds] = useState<Record<string, "building" | "done">>({});
  const finding = useMutation({
    mutationFn: () => findFn({ data: search }),
    onSuccess: (result) => {
      setFound(result);
      if (!result.prospects.length) toast.message(`No businesses without a website found for "${result.query}".`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const buildFound = async (prospect: FoundProspect) => {
    setBuiltIds((current) => ({ ...current, [prospect.placeId]: "building" }));
    try {
      const result = await start({ data: prospectDemoInput(prospect, search.niche) });
      setBuiltIds((current) => ({ ...current, [prospect.placeId]: "done" }));
      toast.success(`Building a demo for ${prospect.name}.`);
      onBuildStarted?.({ organizationId: result.organizationId, name: prospect.name, previewToken: result.previewToken });
      void qc.invalidateQueries({ queryKey: ["jarvis", "prospect-demos"] });
    } catch (error) {
      setBuiltIds((current) => { const next = { ...current }; delete next[prospect.placeId]; return next; });
      toast.error(error instanceof Error ? error.message : "Couldn't start the build.");
    }
  };
  const [form, setForm] = useState(EMPTY);
  const mapsFn = useServerFn(prospectFromMapsFn);
  const imageFn = useServerFn(prospectFromImageFn);
  const [sourceInput, setSourceInput] = useState("");
  const [prefilled, setPrefilled] = useState<Prefill | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const applyPrefill = (result: Prefill) => {
    // Replace the form: these are facts for one specific business.
    setForm({ ...EMPTY, ...result.prefill });
    setPrefilled(result);
    toast.success("Form filled. Check the facts, then build.");
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const fromMaps = useMutation({
    mutationFn: () => mapsFn({ data: { input: sourceInput } }),
    onSuccess: applyPrefill,
    onError: (error: Error) => toast.error(error.message),
  });
  const fromImage = useMutation({
    mutationFn: async (file: File) => imageFn({ data: { dataUrl: await pictureDataUrl(file) } }),
    onSuccess: applyPrefill,
    onError: (error: Error) => toast.error(error.message),
  });
  const reading = fromMaps.isPending || fromImage.isPending;
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
    refetchInterval: (query) => pollWhileActive(query.state.data),
  });
  // The queue pump lives in useProspectDemoPump, which the Jarvis page runs.

  const building = useMutation({
    mutationFn: (input: typeof EMPTY) => start({ data: input }),
    onSuccess: (result, input) => {
      toast.success("Demo build started. The AI team is writing the site now.");
      onBuildStarted?.({ organizationId: result.organizationId, name: input.businessName, previewToken: result.previewToken });
      setForm(EMPTY);
      setPrefilled(null);
      void qc.invalidateQueries({ queryKey: ["jarvis", "prospect-demos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const previewUrl = (token: string) =>
    typeof window === "undefined" ? `/p/${token}` : `${window.location.origin}/p/${token}`;

  return (
    <details className="rounded-xl border border-border bg-card" open>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium">
        <Hammer className="size-4" aria-hidden />
        Demo site builder · for businesses with no website
      </summary>
      <div className="space-y-3 border-t border-border p-3">
        <p className="text-xs text-muted-foreground">
          Enter only real, public facts about the business. Jarvis creates a private draft workspace and the AI team
          builds the site on your free model pool. Missing facts are left out, never invented. The site is not
          published; you get a private 30-day preview link to share.
        </p>
        <section aria-label="Find businesses without a website" className="space-y-2 rounded-lg border border-border p-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Search className="size-4" aria-hidden />Find businesses without a website</h3>
          <p className="text-xs text-muted-foreground">Searches Google Places and keeps only businesses with no website or just a social/directory page. Up to 20 results per search, 40 searches a day.</p>
          <form
            className="grid gap-2 sm:grid-cols-[1fr_1fr_5rem_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              finding.mutate();
            }}
          >
            <Input aria-label="Kind of business" placeholder="Mobile detailing" value={search.niche} required onChange={(event) => setSearch((current) => ({ ...current, niche: event.target.value }))} />
            <Input aria-label="City" placeholder="Raleigh" value={search.city} required onChange={(event) => setSearch((current) => ({ ...current, city: event.target.value }))} />
            <Input aria-label="State" placeholder="NC" value={search.state} onChange={(event) => setSearch((current) => ({ ...current, state: event.target.value }))} />
            <Button type="submit" size="sm" className="h-9" disabled={finding.isPending}>{finding.isPending ? "Searching…" : "Find"}</Button>
          </form>
          {found ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {found.prospects.length} of {found.searched} results for "{found.query}" have no real website.
              </p>
              {found.prospects.map((prospect) => {
                const state = builtIds[prospect.placeId];
                return (
                  <article key={prospect.placeId} className="rounded-md border border-border p-2.5 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{prospect.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[prospect.category, prospect.address, prospect.phone].filter(Boolean).join(" · ")}
                        </p>
                        <p className="mt-0.5 text-xs">
                          {prospect.presence === "none" ? "No website listed" : `Only a social/directory page: ${prospect.website}`}
                          {prospect.rating !== null ? ` · ${prospect.rating}★ (${prospect.reviewCount ?? 0} reviews)` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {prospect.mapsUri ? (
                          <a href={prospect.mapsUri} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-xs hover:bg-muted">Maps</a>
                        ) : null}
                        <Button type="button" size="sm" disabled={Boolean(state)} onClick={() => { void buildFound(prospect); }}>
                          {state === "building" ? "Starting…" : state === "done" ? "Building" : "Build demo"}
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
        <section aria-label="Start from Google Maps or a picture" className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><MapPin className="size-4" aria-hidden />Start from Google Maps or a picture</h3>
          <p className="text-xs text-muted-foreground">
            Paste the business's Google Maps link (Share → Copy link) or its name and city, or add a screenshot of the
            listing, a business card, flyer or sign. Jarvis fills the form from what's really there; you check it, then
            build.
          </p>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              fromMaps.mutate();
            }}
          >
            <Input
              aria-label="Google Maps link or business name and city"
              value={sourceInput}
              placeholder="https://maps.app.goo.gl/… or Joe's Plumbing Raleigh NC"
              onChange={(event) => setSourceInput(event.target.value)}
              className="min-w-0 flex-1"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" className="h-9 flex-1 sm:flex-none" disabled={reading || sourceInput.trim().length < 3}>
                <MapPin className="mr-1 size-3.5" aria-hidden />
                {fromMaps.isPending ? "Looking up…" : "Fill from Maps"}
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-9 flex-1 sm:flex-none" disabled={reading} onClick={() => fileRef.current?.click()}>
                <ImageUp className="mr-1 size-3.5" aria-hidden />
                {fromImage.isPending ? "Reading picture…" : "From a picture"}
              </Button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) fromImage.mutate(file);
              }}
            />
          </form>
          {prefilled ? (
            <div className="space-y-1 text-xs" role="status">
              <p className="text-muted-foreground">{prefilled.note}</p>
              {prefilled.hasRealWebsite && prefilled.website ? (
                <p className="text-accent">
                  This business already lists a website ({prefilled.website}). A demo still works, but pitching an
                  upgrade of their current site may land better.
                </p>
              ) : null}
              {prefilled.mapsUri ? (
                <a href={prefilled.mapsUri} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline">
                  <ExternalLink className="size-3" aria-hidden />Check the listing on Google Maps
                </a>
              ) : null}
            </div>
          ) : null}
        </section>
        <form
          ref={formRef}
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            building.mutate(form);
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
                  {onPreview ? (
                    <Button
                      type="button"
                      size="sm"
                      data-jarvis-tap=""
                      aria-label={`Preview ${demo.name} here`}
                      onClick={() => onPreview({ organizationId: demo.organizationId, name: demo.name, previewToken: demo.previewToken })}
                    >
                      <Eye className="mr-1 size-3.5" aria-hidden />Preview here
                    </Button>
                  ) : null}
                  <a className="inline-flex min-h-10 items-center gap-1 rounded-md border border-border px-3 text-xs font-medium hover:bg-muted sm:min-h-8" data-jarvis-tap="" href={`/p/${demo.previewToken}`} target="_blank" rel="noreferrer">
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
