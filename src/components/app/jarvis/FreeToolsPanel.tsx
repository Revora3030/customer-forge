import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Gauge, MonitorCheck, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getJarvisFreeToolReadiness, runJarvisDiagnosticTool } from "@/lib/jarvis.functions";

const tools = [
  { id: "website.lighthouse.audit", title: "Speed & SEO", icon: Gauge },
  { id: "website.browser.check", title: "Live page", icon: MonitorCheck },
  { id: "docs.lookup", title: "Documentation", icon: BookOpen },
] as const;
type Result = Awaited<ReturnType<typeof runJarvisDiagnosticTool>>;

export function FreeToolsPanel() {
  const readinessFn = useServerFn(getJarvisFreeToolReadiness);
  const run = useServerFn(runJarvisDiagnosticTool);
  const readiness = useQuery({ queryKey: ["jarvis", "free-tool-readiness"], queryFn: () => readinessFn(), staleTime: 60000, retry: false });
  const [target, setTarget] = useState("https://revoragrowthsystems.com/");
  const [query, setQuery] = useState("tanstack start: server functions");
  const [strategy, setStrategy] = useState("mobile");
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [error, setError] = useState<string | null>(null);
  const check = async (toolId: string) => {
    setRunning(toolId);
    setError(null);
    try {
      const result = await run({ data: { toolId, args: toolId === "docs.lookup" ? { query } : { target, strategy } } });
      setResults((previous) => ({ ...previous, [toolId]: result }));
    } catch {
      setError("Check unavailable. No successful result recorded.");
    } finally {
      setRunning(null);
    }
  };
  return <details className="rounded-lg border border-border bg-card">
    <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium"><MonitorCheck className="size-4" aria-hidden />Page checks & docs</summary>
    <div className="space-y-3 border-t border-border p-3">
      <label className="block space-y-1 text-xs">Page address<Input aria-label="Page check address" value={target} onChange={(event) => setTarget(event.target.value)} /></label>
      <div className="flex gap-1" role="group" aria-label="Speed check device">
        {["mobile", "desktop"].map((value) => <Button key={value} size="sm" variant={strategy === value ? "secondary" : "ghost"} aria-pressed={strategy === value} onClick={() => setStrategy(value)}>{value === "mobile" ? "Phone" : "Desktop"}</Button>)}
      </div>
      <label className="block space-y-1 text-xs">Documentation query<Input aria-label="Documentation query" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {tools.map((tool) => {
        const result = results[tool.id];
        const reason = result?.data && typeof result.data === "object" && !Array.isArray(result.data) ? result.data["reason"] : null;
        const configured = readiness.data?.[tool.id];
        const status = reason === "free_quota_exhausted" ? "Quota reached" : result ? result.status === "observed" ? "Checked" : result.status === "failed" ? "Issues found" : "Unavailable" : configured ? "Ready · not checked" : configured === false ? "Needs key" : "Not checked";
        const Icon = tool.icon;
        return <div key={tool.id} className="border-t border-border pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0"><p className="flex items-center gap-2 text-sm font-medium"><Icon className="size-4" aria-hidden />{tool.title}</p><p className="text-xs text-muted-foreground" role="status">{running === tool.id ? "Checking…" : status}</p></div>
            <Button size="icon" variant="outline" aria-label={`Run ${tool.title}`} title={`Run ${tool.title}`} disabled={running !== null || configured !== true} onClick={() => { void check(tool.id); }}><Play className="size-4" aria-hidden /></Button>
          </div>
          {result ? <div className="mt-2 space-y-2"><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(result.data, null, 2)}</pre><p className="text-xs text-muted-foreground">{result.limitations.join(" ")}</p></div> : null}
        </div>;
      })}
      {readiness.error || error ? <p role="alert" className="text-xs text-destructive">{error ?? "Tool settings unavailable."}</p> : null}
    </div>
  </details>;
}