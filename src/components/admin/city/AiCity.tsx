import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Box, Building2, CheckCircle2, List, Pause, Play, RefreshCw, RotateCcw, ShieldCheck, Terminal, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CITY_DISTRICTS, attentionItems, cityCommandDraft, districtCounts, districtForKey, districtFromParam, districtState, hourlyBuckets, salesMissionDraft, workIsActive, type CityWork, type DistrictId, type SalesMission } from "@/lib/ai-city";
import { CityActivity } from "./CityActivity";
import { CityAttention } from "./CityAttention";
import { DistrictCarousel } from "./DistrictCarousel";
import { GROWTH_SYSTEM } from "@/lib/offer";
import { DistrictInspector } from "./DistrictInspector";
import { Sparkline } from "./Sparkline";
import { getAiCity } from "@/lib/ai-city.functions";
import { getCommandCenter } from "@/lib/ai/command-center.functions";
import { getAiHealth } from "@/lib/ai/health.functions";
import { getLunaStatus } from "@/lib/ai/luna.functions";
import { getJarvisRunEvents, runJarvisDiagnosticTool } from "@/lib/jarvis.functions";
import type { CitySceneProps } from "./CityScene";

const CityScene = lazy(() => import("./CityScene"));
class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch() { this.props.onFailure(); }
  override render() { return this.state.failed ? <p className="p-6 text-muted-foreground">3D unavailable. Operations remain available.</p> : this.props.children; }
}

const STATUS_TONE: Record<string, string> = { working: "text-success", attention: "text-gold", idle: "text-muted-foreground", unavailable: "text-destructive" };

export function AiCity() {
  const load = useServerFn(getAiCity);
  const loadModels = useServerFn(getCommandCenter);
  const loadBudget = useServerFn(getLunaStatus);
  const loadHealth = useServerFn(getAiHealth);
  const diagnostic = useServerFn(runJarvisDiagnosticTool);
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ["admin-ai-city"], queryFn: () => load(), refetchInterval: 60_000 });
  const models = useQuery({ queryKey: ["admin-command"], queryFn: () => loadModels() });
  const budget = useQuery({ queryKey: ["admin-city-budget"], queryFn: () => loadBudget(), refetchInterval: 60_000 });
  const linked = districtFromParam((useSearch({ strict: false }) as { district?: unknown }).district);
  const [selected, setSelectedState] = useState<DistrictId>(linked ?? "executive");
  // The chosen district lives in the address (?district=growth) so a view can be bookmarked or shared.
  const setSelected = (id: DistrictId) => {
    setSelectedState(id);
    void navigate({ to: "/admin/city", search: { district: id }, replace: true });
  };
  const [view, setView] = useState<"city" | "operations">("city");
  const [motion, setMotion] = useState(true);
  const [reset, setReset] = useState(0);
  const [palette, setPalette] = useState<CitySceneProps["palette"]>();
  const [tab, setTab] = useState<"work" | "activity" | "models" | "routines">("work");
  const health = useQuery({ queryKey: ["admin-city-catalogue"], queryFn: () => loadHealth(), enabled: tab === "models" });
  const [evidence, setEvidence] = useState<CityWork | null>(null);
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const [now, setNow] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const openDistrict = (id: DistrictId) => { setSelected(id); setInspectorOpen(true); };
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const token = (key: string) => style.getPropertyValue(`--city-${key}`).trim();
    setPalette({ ground: token("ground"), road: token("road"), structure: token("structure"), gold: token("gold"), cyan: token("cyan"), magenta: token("magenta"), light: token("light"), muted: token("muted"), ok: token("ok"), danger: token("danger") });
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { if (media.matches) { setMotion(false); setView("operations"); } };
    sync(); media.addEventListener("change", sync);
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    setNow(Date.now());
    return () => { clearInterval(timer); media.removeEventListener("change", sync); };
  }, []);
  const snapshot = query.isError ? undefined : query.data;
  const district = CITY_DISTRICTS.find(d => d.id === selected) ?? CITY_DISTRICTS[0];
  const rows = Object.values(snapshot?.sources ?? {}).flatMap(source => source.rows);
  const work = rows.filter(row => row.district === selected).sort((a, b) => b.at.localeCompare(a.at));
  const active = rows.filter(row => workIsActive(row, now)).length;
  const attention = attentionItems(snapshot, now);
  const unavailable = Object.entries(snapshot?.sources ?? {}).filter(([, source]) => !source.available).map(([key]) => key);
  const inspect = useMutation({ mutationFn: () => diagnostic({ data: { toolId: district.tool } }), onSettled: () => setDiagnosticOpen(true) });
  const sendDraft = (draft: string) => {
    sessionStorage.setItem("revora:city-mission", draft);
    void navigate({ to: "/admin/jarvis" });
  };
  const prepareMission = () => sendDraft(cityCommandDraft(selected));
  const prepareSalesMission = (kind: SalesMission) => sendDraft(salesMissionDraft(kind, GROWTH_SYSTEM));
  const onKeys = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    // Keys typed in a field, or used inside an open panel or dialog, belong to that control.
    if (event.metaKey || event.ctrlKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable || target.closest("[role=dialog]")) return;
    const next = districtForKey(event.key, selected);
    if (next) { event.preventDefault(); setSelected(next); }
  };
  return <div className="mx-auto max-w-[1800px] space-y-5" onKeyDown={onKeys}>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-1 text-xs font-medium uppercase text-gold">Revora Growth Systems / Operations</p><h1 className="font-display text-3xl font-semibold sm:text-4xl">AI City<span className="text-gold">.</span></h1><p className="mt-2 text-sm text-muted-foreground">Workforce command · founder control</p></div>
      <div className="flex items-center gap-2"><Button variant="outline" size="icon" className="min-h-11 min-w-11" aria-label="Refresh city records" title="Refresh records" disabled={query.isFetching} onClick={() => { void query.refetch(); void models.refetch(); void budget.refetch(); }}><RefreshCw className={query.isFetching ? "size-4 animate-spin" : "size-4"} /></Button><Button asChild variant="signal"><Link to="/admin/jarvis"><Terminal className="size-4" /> Jarvis</Link></Button></div>
    </header>
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border py-4 sm:grid-cols-4">
      <Metric label="Working now" value={snapshot ? String(active) : "Unavailable"} />
      <Metric label="Lovable routing models" value={models.data ? String(models.data.models.length) : models.isError ? "Unavailable" : "Loading"} />
      <Metric label="Growth approvals" value={snapshot?.sources["approvals"]?.total === null || !snapshot?.sources["approvals"]?.available ? "Unavailable" : String(snapshot.sources["approvals"].total)} />
      <Metric label="Monthly AI remaining" value={budget.data && !budget.isError ? `$${budget.data.remainingUsd.toFixed(2)}` : budget.isError ? "Unavailable" : "Loading"} />
    </div>
    <section aria-label="Specialist roster" className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
      {CITY_DISTRICTS.map((d) => {
        const state = districtState(d.id, snapshot, now);
        const counts = districtCounts(snapshot, d.id, now);
        const dot = state === "working" ? "bg-success" : state === "attention" ? "bg-gold" : state === "unavailable" ? "bg-destructive" : "bg-muted-foreground";
        return <button key={d.id} type="button" onClick={() => openDistrict(d.id)} className={`min-h-16 rounded-md border px-3 py-2 text-left ${selected === d.id ? "border-gold bg-gold/10" : "border-border"}`}><span className={`mb-1 block size-2 rounded-full ${dot} ${state === "working" && motion ? "animate-pulse motion-reduce:animate-none" : ""}`} /><span className="block text-xs font-semibold">{d.role}</span><span className="block truncate text-[11px] text-muted-foreground">{d.name}</span><span className="block text-[11px] capitalize text-muted-foreground">{counts ? `${counts.running} running · ${counts.errors} failed` : state}</span></button>;
      })}
    </section>
    {snapshot ? <Sparkline values={hourlyBuckets(Object.values(snapshot.sources).flatMap((source) => source.rows), now)} label="Recorded work per hour, last 24 hours" /> : null}
    {query.isError ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">City records could not be read. Activity is unavailable.<Button variant="outline" onClick={() => query.refetch()}>Retry</Button></div> : null}
    {unavailable.length ? <p role="status" className="text-xs text-destructive">Unavailable sources: {unavailable.join(", ")}. No healthy verdict inferred.</p> : null}
    <CityAttention items={attention} available={!!snapshot} onOpen={row => { setSelected(row.district); setEvidence(row); }} />
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1" role="group" aria-label="City view"><Button variant={view === "city" ? "secondary" : "ghost"} aria-pressed={view === "city"} onClick={() => setView("city")}><Box className="size-4" /> City</Button><Button variant={view === "operations" ? "secondary" : "ghost"} aria-pressed={view === "operations"} onClick={() => setView("operations")}><List className="size-4" /> Operations</Button></div>
      <div className="flex gap-1"><Button size="icon" variant="ghost" className="min-h-11 min-w-11" aria-label={motion ? "Pause activity animation" : "Enable activity animation"} title={motion ? "Pause animation" : "Enable animation"} onClick={() => setMotion(v => !v)}>{motion ? <Pause className="size-4" /> : <Play className="size-4" />}</Button><Button size="icon" variant="ghost" className="min-h-11 min-w-11" aria-label="Reset city camera" title="Reset camera" onClick={() => setReset(v => v + 1)}><RotateCcw className="size-4" /></Button></div>
    </div>
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0" aria-label="AI workforce districts">
        {view === "city" ? <div className="relative h-[330px] touch-none overflow-hidden sm:h-[520px] xl:h-[580px]" aria-label="Interactive 3D workforce city"><SceneBoundary onFailure={() => setView("operations")}><Suspense fallback={<p className="p-6 text-muted-foreground">Loading city architecture…</p>}>{palette ? <CityScene snapshot={snapshot} selected={selected} onSelect={openDistrict} palette={palette} motion={motion} reset={reset} onFailure={() => setView("operations")} /> : null}</Suspense></SceneBoundary><div className="pointer-events-none absolute bottom-3 left-3 bg-background/90 px-3 py-2 text-xs text-muted-foreground">{snapshot ? `Records checked ${new Date(snapshot.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Awaiting records"} · 7 districts · keys 1–7 or arrows switch district</div><ul aria-label="Colour key" className="pointer-events-none absolute right-3 top-3 space-y-1 rounded bg-background/90 px-3 py-2 text-[11px] text-muted-foreground"><li><span className="mr-1.5 inline-block size-2 rounded-full bg-success" />Working</li><li><span className="mr-1.5 inline-block size-2 rounded-full bg-destructive" />Failed</li><li><span className="mr-1.5 inline-block size-2 rounded-full bg-gold" />Waiting</li><li><span className="mr-1.5 inline-block size-2 rounded-full bg-muted-foreground" />Unreadable</li></ul></div> : null}
        <div className={view === "operations" ? "grid gap-2 sm:grid-cols-2" : "mt-3 hidden grid-cols-2 gap-2 sm:grid sm:grid-cols-3"}>
          {CITY_DISTRICTS.map(d => { const state = districtState(d.id, snapshot, now); return <Button key={d.id} variant="outline" aria-pressed={selected === d.id} className={`h-auto min-h-16 min-w-0 justify-start whitespace-normal px-3 py-3 text-left ${selected === d.id ? "border-gold bg-gold/10" : ""}`} onClick={() => openDistrict(d.id)}><Building2 className="size-4 shrink-0 text-gold" /><span className="min-w-0"><span className="block text-xs font-semibold">{d.name}</span><span className={`block text-[11px] capitalize ${STATUS_TONE[state]}`}>{state}</span></span></Button>; })}
        </div>
        {view === "city" ? <DistrictCarousel selected={selected} snapshot={snapshot} now={now} onSelect={setSelected} onOpen={openDistrict} /> : null}
      </section>
      <section className="min-w-0 border-t border-border pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0" aria-label="Selected department">
        <p className="text-xs uppercase text-gold">Department {CITY_DISTRICTS.indexOf(district) + 1} / 07</p><h2 className="mt-2 font-display text-2xl font-semibold">{district.name}</h2><p className="mt-1 text-sm text-muted-foreground">{district.subtitle}</p><p className="mt-4 flex items-center gap-2 text-xs"><Users className="size-4 text-gold" />{district.role}</p>
        <div className="mt-5 space-y-2"><Button className="w-full" variant="signal" onClick={prepareMission}><Terminal className="size-4" /> Prepare mission in Jarvis</Button><Button className="w-full" variant="outline" disabled={inspect.isPending} onClick={() => { inspect.reset(); inspect.mutate(); }}>{inspect.isPending ? <RefreshCw className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Run read-only check</Button><Button asChild className="w-full" variant="ghost"><Link to={district.route}>Open department <ArrowUpRight className="size-4" /></Link></Button></div>
        <p className="mt-3 text-xs text-muted-foreground">Mission drafts do not execute. Paid work, publishing and external sends require explicit review.</p>
        <div className="mt-6 border-t border-border pt-4"><p className="text-xs font-semibold uppercase">Evidence status</p><p className={`mt-2 text-sm capitalize ${STATUS_TONE[districtState(selected, snapshot, now)]}`}>{districtState(selected, snapshot, now)}</p><p className="mt-2 text-xs text-muted-foreground">{work.length} recent records · {work.filter(r => workIsActive(r, now)).length} with a current running heartbeat</p></div>
      </section>
    </div>
    <section className="border-t border-border pt-5">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Workforce records">{(["work", "activity", "models", "routines"] as const).map(key => <Button key={key} role="tab" aria-selected={tab === key} variant={tab === key ? "secondary" : "ghost"} onClick={() => setTab(key)}>{key === "work" ? "Work & evidence" : key === "activity" ? "All activity" : key === "models" ? "Lovable workforce" : "Saved routines"}</Button>)}</div>
      <div className="mt-4" role="tabpanel">
        {tab === "activity" ? <CityActivity snapshot={snapshot} now={now} onOpen={setEvidence} /> : tab === "models" ? health.isError ? <p role="alert">Model records unavailable.</p> : health.isLoading ? <p role="status">Loading Lovable capability evidence…</p> : <><p className="mb-3 text-xs text-muted-foreground">{health.data?.catalogue.state === "live" ? "Live Lovable catalogue" : "Catalogue not freshly verified"} · all returned models · 24-hour recorded calls</p><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{health.data?.catalogue.models.map(model => <div key={model.id} className="min-w-0 rounded-md border border-border p-3"><p className="break-all font-mono text-xs">{model.id}</p><p className="mt-2 text-xs text-muted-foreground">{model.roles.join(" · ") || model.outputs.join(" · ") || "No active role"}</p><p className="mt-2 text-xs text-gold">{model.last24h.attempts ? `${model.last24h.successes} succeeded / ${model.last24h.attempts} calls` : model.eligible ? "Configured · not used yet" : "Not routed"}</p>{model.reason ? <p className="mt-2 text-xs text-muted-foreground">{model.reason}</p> : null}</div>)}</div></> : <WorkList rows={tab === "routines" ? snapshot?.sources["routines"]?.rows ?? [] : work} loading={query.isLoading} onSelect={setEvidence} />}
      </div>
    </section>
    <footer className="flex items-start gap-2 border-t border-border pt-3 text-xs text-muted-foreground"><CheckCircle2 className="size-4 shrink-0" /><p>Recorded operations, not simulated work. Recent feeds show up to 100 rows per source; pending queue totals are exact where available. No roadmap completion percentage inferred.</p></footer>
    <DistrictInspector open={inspectorOpen} onOpenChange={setInspectorOpen} district={selected} snapshot={snapshot} now={now} onRecord={row => { setInspectorOpen(false); setEvidence(row); }} onMission={prepareMission} onSalesMission={prepareSalesMission} onDraft={sendDraft} />
    <Dialog open={!!evidence} onOpenChange={open => { if (!open) setEvidence(null); }}><DialogContent><DialogHeader><DialogTitle>{evidence?.title}</DialogTitle><DialogDescription>Saved operational evidence</DialogDescription></DialogHeader>{evidence ? <><dl className="space-y-3 text-sm"><div><dt className="text-muted-foreground">Source</dt><dd className="break-all font-mono">{evidence.source}</dd></div><div><dt className="text-muted-foreground">Record</dt><dd className="break-all font-mono text-xs">{evidence.id}</dd></div><div><dt className="text-muted-foreground">Status</dt><dd>{evidence.status}</dd></div><div><dt className="text-muted-foreground">Recorded</dt><dd>{evidence.at}</dd></div>{evidence.organizationId ? <div><dt className="text-muted-foreground">Workspace</dt><dd className="break-all font-mono text-xs">{evidence.organizationId}</dd></div> : null}{evidence.model ? <div><dt className="text-muted-foreground">Lovable model</dt><dd>{evidence.model}</dd></div> : null}</dl>{evidence.detail ? <p className="break-words text-sm">{evidence.detail}</p> : null}{evidence.runId ? <RunEvidence runId={evidence.runId} /> : null}</> : null}</DialogContent></Dialog>
    <Dialog open={diagnosticOpen} onOpenChange={setDiagnosticOpen}><DialogContent><DialogHeader><DialogTitle>Department check</DialogTitle><DialogDescription>Read-only evidence; no paid model request</DialogDescription></DialogHeader>{inspect.error ? <p role="alert" className="text-destructive">{inspect.error.message}</p> : inspect.data ? <><p className="text-sm">{inspect.data.title} · {inspect.data.status}</p><p className="text-xs text-muted-foreground">{inspect.data.evidence}</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">{JSON.stringify(inspect.data.data, null, 2)}</pre>{inspect.data.limitations.map((item, index) => <p key={index} className="text-xs text-muted-foreground">{item}</p>)}</> : null}</DialogContent></Dialog>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 break-words font-display text-xl font-semibold sm:text-2xl">{value}</p></div>; }
function WorkList({ rows, loading, onSelect }: { rows: CityWork[]; loading: boolean; onSelect: (row: CityWork) => void }) {
  if (loading) return <p role="status" className="py-5 text-sm text-muted-foreground">Loading recorded work…</p>;
  if (!rows.length) return <p className="py-5 text-sm text-muted-foreground">No records available in this feed.</p>;
  return <ul className="divide-y divide-border">{rows.slice(0, 25).map(row => <li key={row.id}><Button variant="ghost" className="h-auto min-h-16 w-full justify-between gap-3 whitespace-normal py-3 text-left" onClick={() => onSelect(row)}><span className="min-w-0"><span className="block break-words text-sm">{row.title}</span><span className="mt-1 block text-xs text-muted-foreground">{row.source} {row.progress !== undefined ? `· ${row.progress}%` : ""}</span></span><span className="shrink-0 text-xs text-gold">{row.status} <ArrowUpRight className="ml-1 inline size-3" /></span></Button></li>)}</ul>;
}
function RunEvidence({ runId }: { runId: string }) {
  const load = useServerFn(getJarvisRunEvents);
  const query = useQuery({ queryKey: ["admin-city-run", runId], queryFn: () => load({ data: { runId } }) });
  return <div className="border-t border-border pt-3"><h3 className="text-sm font-semibold">Run trail</h3>{query.error ? <p role="alert" className="text-sm text-destructive">Run evidence unavailable.</p> : query.isLoading ? <p className="text-xs">Loading evidence…</p> : <ul className="mt-2 space-y-2">{query.data?.map(event => <li key={event.id} className="text-xs"><span className="text-gold">{event.step} · {event.status}</span> {event.label || event.tool_id || event.kind}<p className="break-words text-muted-foreground">{event.output_summary}</p></li>)}</ul>}</div>;
}