import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Radar, Send, Sparkles, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Sparkline } from "./Sparkline";
import { CITY_DISTRICTS, districtState, hourlyBuckets, pipelineStages, workIsActive, type CitySnapshot, type CityWork, type DistrictId, type SalesMission } from "@/lib/ai-city";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  district: DistrictId;
  snapshot: CitySnapshot | undefined;
  now: number;
  onRecord: (row: CityWork) => void;
  onMission: () => void;
  onSalesMission: (kind: SalesMission) => void;
};

const SALES_ACTIONS: Array<{ kind: SalesMission; label: string; icon: typeof Radar }> = [
  { kind: "scout", label: "Find prospects", icon: Radar },
  { kind: "demo", label: "Build private demo", icon: Sparkles },
  { kind: "pitch", label: "Draft pitch for approval", icon: Send },
];

export function DistrictInspector({ open, onOpenChange, district, snapshot, now, onRecord, onMission, onSalesMission }: Props) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => setWide(media.matches);
    sync(); media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const info = CITY_DISTRICTS.find(d => d.id === district) ?? CITY_DISTRICTS[0];
  const rows = Object.values(snapshot?.sources ?? {}).flatMap(s => s.rows).filter(r => r.district === district).sort((a, b) => b.at.localeCompare(a.at));
  const running = rows.filter(r => workIsActive(r, now));
  const queued = rows.filter(r => ["queued", "pending", "waiting", "retrying"].includes(r.status));
  const errors = rows.filter(r => ["failed", "error"].includes(r.status));
  const routines = district === "executive" ? snapshot?.sources["routines"]?.rows ?? [] : [];
  const models = new Map<string, { ok: number; total: number }>();
  for (const r of rows) if (r.model) { const m = models.get(r.model) ?? { ok: 0, total: 0 }; m.total += 1; if (r.status !== "failed" && r.status !== "error") m.ok += 1; models.set(r.model, m); }
  const state = districtState(district, snapshot, now);
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side={wide ? "right" : "bottom"} className={wide ? "w-[440px] overflow-y-auto sm:max-w-[440px]" : "max-h-[85vh] overflow-y-auto rounded-t-xl"}>
      <SheetHeader className="text-left">
        <p className="text-xs uppercase text-gold">{info.role}</p>
        <SheetTitle className="font-display text-2xl">{info.name}</SheetTitle>
        <SheetDescription>{info.subtitle} · <span className="capitalize">{state}</span></SheetDescription>
      </SheetHeader>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Running" value={snapshot ? running.length : null} />
        <Stat label="Queued" value={snapshot ? queued.length : null} />
        <Stat label="Errors" value={snapshot ? errors.length : null} />
      </div>
      <section className="mt-5" aria-label="Throughput"><h3 className="text-xs font-semibold uppercase">Records per hour · last 24 hours</h3><div className="mt-2">{snapshot ? <Sparkline values={hourlyBuckets(rows, now, 24)} label="Records per hour, last 24 hours" /> : <p className="text-[11px] text-muted-foreground">Unavailable.</p>}</div></section>
      {district === "growth" ? <section className="mt-5" aria-label="Sales pipeline">
        <h3 className="text-xs font-semibold uppercase">Sales pipeline</h3>
        <ol className="mt-2 grid grid-cols-5 gap-1">{pipelineStages(snapshot?.pipeline).map(s => <li key={s.key} className="min-w-0 rounded-md border border-border p-2 text-center"><p className="break-words font-display text-sm font-semibold">{s.display === "Unavailable" ? "—" : s.display}</p><p className="mt-1 text-[10px] leading-tight text-muted-foreground">{s.label}</p>{s.display === "Unavailable" ? <span className="sr-only">Unavailable</span> : null}</li>)}</ol>
        <p className="mt-2 text-[11px] text-muted-foreground">"—" means the record could not be read, not zero.</p>
        <div className="mt-3 grid gap-2">{SALES_ACTIONS.map(a => <Button key={a.kind} variant="outline" className="min-h-11 justify-start" onClick={() => onSalesMission(a.kind)}><a.icon className="size-4 text-gold" /> {a.label}</Button>)}</div>
        <p className="mt-2 text-[11px] text-muted-foreground">Each step opens a draft in Jarvis. Nothing is sent until you approve it in the approval queue.</p>
      </section> : null}
      <section className="mt-5"><h3 className="text-xs font-semibold uppercase">Models used (recorded calls)</h3>
        {models.size ? <ul className="mt-2 space-y-1">{[...models].map(([id, m]) => <li key={id} className="flex justify-between gap-2 text-xs"><span className="break-all font-mono">{id}</span><span className="shrink-0 text-gold">{m.ok}/{m.total}</span></li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">No model calls recorded for this district in the current feeds.</p>}
      </section>
      {routines.length ? <section className="mt-5"><h3 className="text-xs font-semibold uppercase">Routines</h3><Rows rows={routines} onRecord={onRecord} /></section> : null}
      <section className="mt-5"><h3 className="text-xs font-semibold uppercase">Recent records</h3>{snapshot ? rows.length ? <Rows rows={rows.slice(0, 12)} onRecord={onRecord} /> : <p className="mt-2 text-xs text-muted-foreground">No records in this district's feeds.</p> : <p role="alert" className="mt-2 text-xs text-destructive">Records unavailable.</p>}</section>
      <div className="mt-6 grid gap-2 pb-4">
        <Button variant="signal" className="min-h-11" onClick={onMission}><Terminal className="size-4" /> Prepare mission in Jarvis</Button>
        <Button asChild variant="ghost" className="min-h-11"><Link to={info.route}>Open department <ArrowUpRight className="size-4" /></Link></Button>
      </div>
    </SheetContent>
  </Sheet>;
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return <div className="rounded-md border border-border p-2"><p className="font-display text-lg font-semibold">{value === null ? "—" : value}</p><p className="text-[11px] text-muted-foreground">{label}</p></div>;
}
function Rows({ rows, onRecord }: { rows: CityWork[]; onRecord: (row: CityWork) => void }) {
  return <ul className="mt-2 divide-y divide-border">{rows.map(r => <li key={r.id}><Button variant="ghost" className="h-auto min-h-11 w-full justify-between gap-2 whitespace-normal px-1 py-2 text-left" onClick={() => onRecord(r)}><span className="min-w-0 break-words text-xs">{r.title}</span><span className="shrink-0 text-[11px] text-gold">{r.status}</span></Button></li>)}</ul>;
}
