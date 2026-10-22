import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Cpu, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getJarvisDiagnosticTools, getJarvisFreeToolReadiness, getJarvisModelStatus, getLovableModelUsage } from "@/lib/jarvis.functions";
import type { ProviderLevel } from "@/lib/jarvis-model-status";

const LEVEL: Record<ProviderLevel, { label: string; tone: string }> = {
  healthy: { label: "Healthy", tone: "text-primary" },
  reachable: { label: "Reachable", tone: "text-foreground" },
  degraded: { label: "Failing often", tone: "text-destructive" },
  rate_limited: { label: "Rate limited", tone: "text-destructive" },
  resting: { label: "Resting", tone: "text-muted-foreground" },
  configured: { label: "Key set, no successful call yet", tone: "text-muted-foreground" },
  not_configured: { label: "No key", tone: "text-muted-foreground" },
};
const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const summaryRow = "flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden";

export function ModelsPanel() {
  const fn = useServerFn(getJarvisModelStatus);
  const q = useQuery({ queryKey: ["jarvis", "model-status"], queryFn: () => fn(), staleTime: 60000 });
  return (
    <details className="rounded-xl border border-border bg-card">
      <summary className={summaryRow}><Cpu className="size-4" aria-hidden />AI models · live health</summary>
      <div className="space-y-2 border-t border-border/60 p-3">
        <p className="text-xs text-muted-foreground">From recorded calls in the last 24 hours. A key being set is not proof a model works; "Healthy" needs 80%+ success over 3+ calls.</p>
        {q.isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {q.isError ? <div role="alert" className="text-sm">Couldn't read AI health. <Button size="sm" variant="link" onClick={() => void q.refetch()}>Retry</Button></div> : null}
        <ul className="space-y-2">
          {(q.data ?? []).map((p) => (
            <li key={p.provider} className="rounded-lg border border-border/70 p-2.5 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium capitalize">{p.provider}</span>
                <span className={`text-xs font-medium ${LEVEL[p.level].tone}`}>{LEVEL[p.level].label}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {p.calls24h} calls · {p.failures24h} failed{p.successRate24h !== null ? ` · ${p.successRate24h}% ok` : ""} · last success {ago(p.lastSuccessAt)}
                {p.restingUntil ? ` · resting until ${new Date(p.restingUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
                {p.lastLatencyMs !== null ? ` · ${(p.lastLatencyMs / 1000).toFixed(1)}s last reply` : ""}
              </p>
              {p.models.length ? <p className="mt-1 break-words text-xs text-muted-foreground">Models used: {p.models.map((m) => `${m.model} (${m.ok}/${m.calls})`).join(", ")}</p> : null}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

export function LovableModelsPanel() {
  const fn = useServerFn(getLovableModelUsage);
  const q = useQuery({ queryKey: ["jarvis", "lovable-model-usage"], queryFn: () => fn(), staleTime: 60000 });
  return (
    <details className="rounded-xl border border-border bg-card">
      <summary className={summaryRow}><Cpu className="size-4" aria-hidden />Lovable models used · last 24 h</summary>
      <div className="space-y-2 border-t border-border/60 p-3">
        <p className="text-xs text-muted-foreground">Recorded calls only. Cost shows "unknown" when no cost was recorded.</p>
        {q.isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {q.isError ? <div role="alert" className="text-sm">Couldn't read model usage. <Button size="sm" variant="link" onClick={() => void q.refetch()}>Retry</Button></div> : null}
        <ul className="space-y-2">
          {(q.data ?? []).map((m) => (
            <li key={m.model} className="rounded-lg border border-border/70 p-2.5 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="break-all font-medium">{m.model}</span>
                <span className={`text-xs font-medium ${m.calls ? "text-foreground" : "text-muted-foreground"}`}>{m.calls ? `${m.ok}/${m.calls} worked` : "Not used yet"}</span>
              </div>
              {m.calls ? (
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {m.failed} failed · cost {m.costUsd === null ? "unknown" : `$${m.costUsd.toFixed(4)}`}{m.jobs.length ? ` · jobs: ${m.jobs.join(", ")}` : ""}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

const GROUPS: [string, string[]][] = [
  ["AI and models", ["ai"]],
  ["Website builder", ["builder", "website"]],
  ["Growth and CRM", ["growth"]],
  ["Database and backend", ["database", "platform"]],
  ["Security", ["security"]],
  ["Releases and code", ["release"]],
];

export function ToolsPanel() {
  const catFn = useServerFn(getJarvisDiagnosticTools);
  const readyFn = useServerFn(getJarvisFreeToolReadiness);
  const cat = useQuery({ queryKey: ["jarvis", "tool-catalog"], queryFn: () => catFn(), staleTime: 300000 });
  const ready = useQuery({ queryKey: ["jarvis", "free-tool-readiness"], queryFn: () => readyFn(), staleTime: 60000, retry: false });
  const readiness = (ready.data ?? {}) as Record<string, boolean>;
  return (
    <details className="rounded-xl border border-border bg-card">
      <summary className={summaryRow}><Wrench className="size-4" aria-hidden />Tools and permissions</summary>
      <div className="space-y-3 border-t border-border/60 p-3">
        <p className="text-xs text-muted-foreground">Every tool Jarvis can run by itself is read-only. Anything that changes, sends, publishes or spends is only proposed and waits for your Approve tap.</p>
        {cat.isError ? <p role="alert" className="text-sm">Couldn't load the tool list.</p> : null}
        {GROUPS.map(([title, cats]) => {
          const tools = (cat.data ?? []).filter((t) => cats.includes(t.category));
          if (!tools.length) return null;
          return (
            <section key={title} aria-label={title}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
              <ul className="divide-y divide-border/60">
                {tools.map((t) => {
                  const r = t.id in readiness ? readiness[t.id] : null;
                  return (
                    <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5 text-sm">
                      <span className="min-w-0 break-words">{t.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.access === "read" ? "Read-only" : "Changes data"}{t.requiresApproval ? " · needs approval" : ""}
                        {r === true ? " · ready" : r === false ? " · missing key/connection" : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </details>
  );
}
