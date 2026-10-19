import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bot, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getOutreachAutopilot, runOutreachAutopilotNow, saveOutreachAutopilot } from "@/lib/jarvis-demo-site.functions";

type Target = { niche: string; city: string; state: string };

/**
 * Jarvis outreach autopilot: finds businesses with no website, builds their
 * demo sites, and emails each one from the owner's Gmail, up to the daily cap.
 * The switch is the off switch; opt-outs are read from Gmail replies.
 */
export function OutreachAutopilotPanel() {
  const qc = useQueryClient();
  const getFn = useServerFn(getOutreachAutopilot);
  const saveFn = useServerFn(saveOutreachAutopilot);
  const runFn = useServerFn(runOutreachAutopilotNow);
  const state = useQuery({ queryKey: ["jarvis", "outreach-autopilot"], queryFn: () => getFn(), refetchInterval: 30_000 });
  const [targets, setTargets] = useState<Target[]>([]);
  const [cap, setCap] = useState(40);
  useEffect(() => {
    if (!state.data) return;
    setTargets(state.data.targets.length ? state.data.targets : [{ niche: "", city: "", state: "" }]);
    setCap(state.data.dailyCap);
  }, [state.data]);

  const save = useMutation({
    mutationFn: (enabled: boolean) => saveFn({ data: { enabled, targets, dailyCap: cap } }),
    onSuccess: (_r, enabled) => {
      toast.success(enabled ? "Autopilot is on. Jarvis checks every 30 minutes." : "Autopilot saved.");
      void qc.invalidateQueries({ queryKey: ["jarvis", "outreach-autopilot"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const run = useMutation({
    mutationFn: () => runFn(),
    onSuccess: (result) => {
      const r = JSON.parse(result.summary) as { skipped?: string; sent?: number; built?: number; needsEmail?: number };
      toast.success(r.skipped ?? `Sent ${r.sent ?? 0}, started ${r.built ?? 0} new demos${r.needsEmail ? `, ${r.needsEmail} need an email` : ""}.`);
      void qc.invalidateQueries({ queryKey: ["jarvis"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = state.data;
  const last = data?.lastResult ? (JSON.parse(data.lastResult) as { sent?: number; built?: number; needsEmail?: number; optOuts?: number; notes?: string[]; skipped?: string }) : null;
  const setTarget = (index: number, key: keyof Target, value: string) =>
    setTargets((current) => current.map((t, i) => (i === index ? { ...t, [key]: value } : t)));

  return (
    <section aria-label="Outreach autopilot" className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <Bot className="size-4 text-primary" aria-hidden />
        <h3 className="flex-1 text-sm font-medium">Autopilot · find, build and email</h3>
        <Switch
          aria-label="Autopilot on"
          checked={data?.enabled ?? false}
          disabled={!data || save.isPending}
          onCheckedChange={(on) => save.mutate(on)}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Jarvis searches Google Maps for businesses with no website, builds each one a demo site with your free AI team, and emails the
        preview link from your Gmail. Most listings don't show an email, so those demos wait for you to add one. Anyone who replies
        "no thanks" or "stop" is never emailed again.
      </p>
      {targets.map((target, index) => (
        <div key={index} className="grid grid-cols-[1fr_1fr_4.5rem_auto] items-end gap-2">
          <div>
            <Label htmlFor={`ap-niche-${index}`} className="text-xs">Kind of business</Label>
            <Input id={`ap-niche-${index}`} placeholder="mobile detailing" value={target.niche} onChange={(e) => setTarget(index, "niche", e.target.value)} />
          </div>
          <div>
            <Label htmlFor={`ap-city-${index}`} className="text-xs">City</Label>
            <Input id={`ap-city-${index}`} placeholder="Dallas" value={target.city} onChange={(e) => setTarget(index, "city", e.target.value)} />
          </div>
          <div>
            <Label htmlFor={`ap-state-${index}`} className="text-xs">State</Label>
            <Input id={`ap-state-${index}`} placeholder="TX" value={target.state} onChange={(e) => setTarget(index, "state", e.target.value)} />
          </div>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove target" onClick={() => setTargets((c) => c.filter((_, i) => i !== index))}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2">
        <Button type="button" size="sm" variant="outline" disabled={targets.length >= 10} onClick={() => setTargets((c) => [...c, { niche: "", city: "", state: "" }])}>
          <Plus className="mr-1 size-3.5" />Add target
        </Button>
        <div className="w-28">
          <Label htmlFor="ap-cap" className="text-xs">Per day (max 40)</Label>
          <Input id="ap-cap" type="number" min={1} max={40} value={cap} onChange={(e) => setCap(Math.max(1, Math.min(40, Number(e.target.value) || 1)))} />
        </div>
        <Button type="button" size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate(data?.enabled ?? false)}>
          Save
        </Button>
        <Button type="button" size="sm" disabled={run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? "Running…" : "Run now"}
        </Button>
      </div>
      {data ? (
        <p className="text-xs text-muted-foreground" role="status">
          Sent today: {data.sentToday}/{data.dailyCap}
          {data.lastRunAt ? ` · last run ${new Date(data.lastRunAt).toLocaleString()}` : " · not run yet"}
          {last && !last.skipped ? ` · sent ${last.sent ?? 0}, started ${last.built ?? 0}, waiting for email ${last.needsEmail ?? 0}, opt-outs ${last.optOuts ?? 0}` : ""}
          {last?.skipped ? ` · ${last.skipped}` : ""}
        </p>
      ) : null}
      {last?.notes?.length ? <p className="text-xs text-destructive">{last.notes.join(" ")}</p> : null}
      {data?.recent.length ? (
        <ul className="space-y-1 text-xs" aria-label="Recent emails">
          {data.recent.map((item) => (
            <li key={`${item.email}-${item.createdAt}`} className="flex flex-wrap gap-x-2">
              <span className="font-medium">{item.email}</span>
              <span className={item.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
                {item.status} · {item.source} · {new Date(item.createdAt).toLocaleString()}
              </span>
              {item.error ? <span className="w-full break-words text-destructive">{item.error}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
