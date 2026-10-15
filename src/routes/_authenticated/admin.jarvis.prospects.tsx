import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Search, RefreshCw, Save, ShieldCheck, ArrowUpRight, Hammer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { discoverJarvisProspects, saveJarvisProspects, listJarvisProspects, queueJarvisSitePreparation } from "@/lib/jarvis-acquisition.functions";

export const Route = createFileRoute("/_authenticated/admin/jarvis/prospects")({
  head: () => ({ meta: [{ title: "Jarvis prospect pipeline — Revora" }, { name: "robots", content: "noindex" }] }),
  component: JarvisProspects,
});
type Candidate = { externalId: string; name: string; category: string; city: string; region: string; phone: string | null; websiteUrl: string | null; websiteStatus: "website_found" | "no_website_listed"; mapsUrl: string | null; businessStatus: string; leadScore: number; verificationRequired: boolean };
const compact = "h-10";

function JarvisProspects() {
  const qc = useQueryClient();
  const discover = useServerFn(discoverJarvisProspects), save = useServerFn(saveJarvisProspects);
  const list = useServerFn(listJarvisProspects), queue = useServerFn(queueJarvisSitePreparation);
  const [category, setCategory] = useState("pressure washing"), [city, setCity] = useState("Carrboro");
  const [region, setRegion] = useState("North Carolina"), [limit, setLimit] = useState("10");
  const [candidates, setCandidates] = useState<Candidate[]>([]), [selected, setSelected] = useState<string[]>([]);
  const prospects = useQuery({ queryKey: ["jarvis","prospects"], queryFn: () => list(), retry: false });
  const discovery = useMutation({ mutationFn: () => discover({ data: { query: category, city, region, limit: Number(limit) } }),
    onSuccess: (result) => { setCandidates(result.candidates as Candidate[]); setSelected(result.candidates.filter((c: Candidate) => c.websiteStatus === "no_website_listed").map((c: Candidate) => c.externalId)); toast.success(`Found ${result.count} businesses`); },
    onError: (error: Error) => toast.error(error.message) });
  const saving = useMutation({ mutationFn: () => save({ data: { candidates: candidates.filter((c) => selected.includes(c.externalId)) } }),
    onSuccess: (result) => { toast.success(`Saved ${result.saved.length} prospects`); setCandidates([]); setSelected([]); return qc.invalidateQueries({ queryKey: ["jarvis","prospects"] }); },
    onError: (error: Error) => toast.error(error.message) });
  const preparing = useMutation({ mutationFn: (prospectId: string) => queue({ data: { prospectId } }),
    onSuccess: (result) => { toast.success(result.message); return qc.invalidateQueries({ queryKey: ["jarvis","prospects"] }); },
    onError: (error: Error) => toast.error(error.message) });
  return <main className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
    <header className="space-y-2"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Search className="h-4 w-4" /> Jarvis / Customer acquisition</div>
      <h1 className="text-3xl font-semibold tracking-tight">Prospect pipeline</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">Find local businesses, identify missing website listings, save evidence-backed leads, and queue private demo preparation. Discovery never contacts owners, publishes a site, or charges a customer.</p></header>
    <section className="space-y-4 rounded-xl border bg-card p-4 md:p-6"><h2 className="font-semibold">Find businesses</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-sm">Business category<Input className={compact} value={category} onChange={(e) => setCategory(e.target.value)} maxLength={120} /></label>
        <label className="space-y-1 text-sm">City<Input className={compact} value={city} onChange={(e) => setCity(e.target.value)} maxLength={100} /></label>
        <label className="space-y-1 text-sm">State / region<Input className={compact} value={region} onChange={(e) => setRegion(e.target.value)} maxLength={100} /></label>
        <label className="space-y-1 text-sm">Maximum results<Input className={compact} type="number" min={1} max={20} value={limit} onChange={(e) => setLimit(e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap gap-2"><Button onClick={() => discovery.mutate()} disabled={discovery.isPending || !category.trim() || !city.trim() || !region.trim()}><Search className="mr-2 h-4 w-4" />{discovery.isPending ? "Searching…" : "Find businesses"}</Button>
        <Button variant="outline" onClick={() => { setCandidates([]); setSelected([]); }}><RefreshCw className="mr-2 h-4 w-4" />Clear results</Button></div>
      {candidates.length > 0 && <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{candidates.length} candidates · select businesses with no website listed</p>
        <Button variant="secondary" onClick={() => saving.mutate()} disabled={saving.isPending || !selected.length}><Save className="mr-2 h-4 w-4" />Save selected ({selected.length})</Button></div>
        <div className="divide-y rounded-lg border">{candidates.map((c) => <label key={c.externalId} className="flex cursor-pointer gap-3 p-3 hover:bg-muted/40"><input type="checkbox" className="mt-1 h-4 w-4" checked={selected.includes(c.externalId)} onChange={(e) => setSelected((old) => e.target.checked ? [...old,c.externalId] : old.filter((id) => id !== c.externalId))} />
          <div className="min-w-0 flex-1 space-y-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{c.name}</span><Badge variant="outline">{c.websiteStatus === "no_website_listed" ? "No website listed" : "Website listed"}</Badge><Badge variant="outline">Score {c.leadScore}</Badge></div>
            <p className="text-sm text-muted-foreground">{c.category} · {c.city}, {c.region} · {c.businessStatus}</p><p className="text-sm">{c.phone || "No phone listed"}{c.websiteUrl ? " · " + c.websiteUrl : ""}</p>
            {c.mapsUrl && <a href={c.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline">Source listing <ArrowUpRight className="h-3 w-3" /></a>}</div></label>)}</div></div>}
    </section>
    <section className="space-y-3 rounded-xl border bg-card p-4 md:p-6"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Saved acquisition pipeline</h2><p className="text-sm text-muted-foreground">High-score leads first. Demo preparation requires review.</p></div><Button variant="outline" size="sm" onClick={() => prospects.refetch()} disabled={prospects.isFetching}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
      {prospects.isLoading ? <p className="text-sm text-muted-foreground">Loading prospects…</p> : prospects.error ? <p className="text-sm text-destructive">Could not load prospects. Confirm the migration has been applied.</p> : prospects.data?.length ? <div className="divide-y rounded-lg border">{prospects.data.map((p) => <div key={p.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1 space-y-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{p.businessName}</span><Badge variant="outline">{p.websiteStatus.replaceAll("_"," ")}</Badge><Badge variant="outline">Score {p.leadScore}</Badge><Badge variant="secondary">{p.status.replaceAll("_"," ")}</Badge></div>
        <p className="text-sm text-muted-foreground">{p.category} · {p.city}, {p.region}</p><p className="text-sm">{p.phone || "No phone listed"}{p.websiteUrl ? " · " + p.websiteUrl : ""}</p>{p.sourceUrl && <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline">Open source <ArrowUpRight className="h-3 w-3" /></a>}</div>
        <Button variant="outline" size="sm" onClick={() => preparing.mutate(p.id)} disabled={preparing.isPending || p.websiteStatus === "website_found" || p.status === "suppressed"}><Hammer className="mr-2 h-4 w-4" />Queue private demo</Button></div>)}</div> : <p className="text-sm text-muted-foreground">No prospects saved yet. Run a search above to start.</p>}</section>
    <aside className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><p>A missing Places website field is only a lead signal, not proof the business has no site. The current queue action creates an approval-required task only; it does not generate, publish, contact, or charge. Verify facts before advancing.</p></aside>
  </main>;
}
