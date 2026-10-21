import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, FileSearch, Gauge, Image as ImageIcon, MonitorCheck, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getJarvisFreeToolReadiness, runJarvisDiagnosticTool } from "@/lib/jarvis.functions";

const tools = [
  { id: "website.lighthouse.audit", title: "Speed & SEO", icon: Gauge },
  { id: "website.browser.check", title: "Live page", icon: MonitorCheck },
  { id: "website.page.audit", title: "Page SEO (Browserbase)", icon: FileSearch },
  { id: "images.stock.search", title: "Stock photos", icon: ImageIcon },
  { id: "docs.lookup", title: "Documentation", icon: BookOpen },
] as const;
const services = [
  { id: "stock.unsplash", label: "Unsplash photos", key: "UNSPLASH_ACCESS_KEY", link: "https://unsplash.com/oauth/applications" },
  { id: "stock.pexels", label: "Pexels photos", key: "PEXELS_API_KEY", link: "https://www.pexels.com/api/new/" },
  { id: "image.cloudflare", label: "Cloudflare AI images", key: "CLOUDFLARE_AI_API_TOKEN", link: "https://dash.cloudflare.com/profile/api-tokens" },
  { id: "image.huggingface", label: "Hugging Face AI images", key: "HUGGINGFACE_API_KEY", link: "https://huggingface.co/settings/tokens" },
  { id: "image.pollinations", label: "Pollinations AI images", key: "POLLINATIONS_API_KEY", link: "https://auth.pollinations.ai/" },
] as const;
type Result = Awaited<ReturnType<typeof runJarvisDiagnosticTool>>;

export function FreeToolsPanel() {
  const readinessFn = useServerFn(getJarvisFreeToolReadiness);
  const run = useServerFn(runJarvisDiagnosticTool);
  const readiness = useQuery({ queryKey: ["jarvis", "free-tool-readiness"], queryFn: () => readinessFn(), staleTime: 60000, retry: false });
  const [target, setTarget] = useState("https://revoragrowthsystems.com/");
  const [query, setQuery] = useState("tanstack start: server functions");
  const [photoQuery, setPhotoQuery] = useState("auto detailing foam wash");
  const [strategy, setStrategy] = useState("mobile");
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [error, setError] = useState<string | null>(null);
  const check = async (toolId: string) => {
    setRunning(toolId);
    setError(null);
    try {
      const result = await run({ data: { toolId, args: toolId === "docs.lookup" ? { query } : toolId === "images.stock.search" ? { query: photoQuery } : { target, strategy } } });
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
      <label className="block space-y-1 text-xs">Photo search<Input aria-label="Stock photo search" value={photoQuery} onChange={(event) => setPhotoQuery(event.target.value)} /></label>
      {tools.map((tool) => {
        const result = results[tool.id];
        const reason = result?.data && typeof result.data === "object" && !Array.isArray(result.data) && "reason" in result.data ? result.data["reason"] : null;
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
      <div className="border-t border-border pt-3">
        <p className="text-sm font-medium">Picture services</p>
        <ul className="mt-2 space-y-1 text-xs">
          {services.map((service) => {
            const ready = readiness.data?.[service.id];
            return <li key={service.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{service.label}</span>
              {ready ? <span className="text-muted-foreground">Key saved · not checked</span> : ready === false ? <a className="underline underline-offset-2" href={service.link} target="_blank" rel="noreferrer">Needs {service.key} · get key</a> : <span className="text-muted-foreground">Unknown</span>}
            </li>;
          })}
        </ul>
      </div>
      {readiness.error || error ? <p role="alert" className="text-xs text-destructive">{error ?? "Tool settings unavailable."}</p> : null}
    </div>
  </details>;
}