import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Accessibility, Archive, BookOpen, Bug, CalendarDays, Cloud, Code2, FileSearch, FileText, Globe, Landmark, Lock, Mail, Sheet, Gauge, Image as ImageIcon, Link, MonitorCheck, Play, ScrollText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getJarvisFreeToolReadiness, runJarvisDiagnosticTool } from "@/lib/jarvis.functions";

const tools = [
  { id: "website.html.audit", title: "Page SEO · no key", icon: FileSearch },
  { id: "website.accessibility.static", title: "Accessibility & schema · no key", icon: Accessibility },
  { id: "website.security.headers", title: "Security headers · no key", icon: ShieldCheck },
  { id: "website.links.inventory", title: "Links & anchors · no key", icon: Link },
  { id: "website.lighthouse.audit", title: "Speed & SEO", icon: Gauge },
  { id: "website.browser.check", title: "Live page", icon: MonitorCheck },
  { id: "website.page.audit", title: "Page SEO (Browserbase)", icon: FileSearch },
  { id: "images.stock.search", title: "Stock photos", icon: ImageIcon },
  { id: "docs.lookup", title: "Documentation", icon: BookOpen },
  { id: "website.dns.lookup", title: "DNS records · no key", icon: Globe },
  { id: "website.html.validate", title: "HTML validator · no key", icon: Code2 },
  { id: "website.security.observatory", title: "Security grade · no key", icon: Lock },
  { id: "security.dependencies.osv", title: "Dependency vulnerabilities · no key", icon: Bug },
  { id: "domain.rdap.lookup", title: "Domain registration · no key", icon: Landmark },
  { id: "domain.wayback.history", title: "Wayback history · no key", icon: Archive },
  { id: "website.text.extract", title: "Readable page text · no key", icon: FileText },
  { id: "web.page.read", title: "Read a page · no key", icon: ScrollText },
  { id: "workspace.calendar.upcoming", title: "Google Calendar · next 7 days", icon: CalendarDays },
  { id: "workspace.sheets.read", title: "Google Sheets outline", icon: Sheet },
  { id: "cloudflare.zones.summary", title: "Cloudflare domains", icon: Cloud },
  { id: "email.resend.domains", title: "Resend sending domains", icon: Mail },
  { id: "ai.omniroute.models", title: "OmniRoute models · your server", icon: Cloud },
] as const;
const services = [
  { id: "stock.unsplash", label: "Unsplash photos", key: "UNSPLASH_ACCESS_KEY", link: "https://unsplash.com/oauth/applications" },
  { id: "stock.pexels", label: "Pexels photos", key: "PEXELS_API_KEY", link: "https://www.pexels.com/api/new/" },
  { id: "image.cloudflare", label: "Cloudflare AI images", key: "CLOUDFLARE_AI_API_TOKEN", link: "https://dash.cloudflare.com/profile/api-tokens" },
] as const;
type Readiness = Awaited<ReturnType<typeof getJarvisFreeToolReadiness>>["tools"][string];
const STATE_LABEL: Record<Readiness["state"], string> = {
  keyless: "Ready · no key",
  keyless_shared_quota: "Ready · shared free quota",
  key_present: "Key saved · not checked",
  needs_key: "Needs key",
  not_implemented: "Not available",
};
const RUN_LABEL: Record<string, string> = { observed: "checked", failed: "issues found", unknown: "unavailable", needs_verification: "needs verification" };
function lastRunText(entry: Readiness | undefined): string | null {
  const run = entry?.lastRun;
  if (!run) return null;
  const at = new Date(run.at);
  const when = Number.isNaN(at.getTime()) ? "unknown time" : at.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  return `Last run ${when}: ${RUN_LABEL[run.status] ?? "unavailable"}${run.reason ? ` (${run.reason.replace(/_/g, " ")})` : ""}`;
}
const serverTools = [
  ["Ollama", "https://ollama.com"], ["vLLM", "https://github.com/vllm-project/vllm"], ["ComfyUI", "https://github.com/comfyanonymous/ComfyUI"], ["Whisper", "https://github.com/openai/whisper"], ["Piper voices", "https://github.com/rhasspy/piper"], ["Real-ESRGAN", "https://github.com/xinntao/Real-ESRGAN"], ["rembg", "https://github.com/danielgatis/rembg"], ["Wan video", "https://github.com/Wan-Video/Wan2.1"], ["SearXNG", "https://github.com/searxng/searxng"], ["Crawl4AI", "https://github.com/unclecode/crawl4ai"], ["Semgrep", "https://github.com/semgrep/semgrep"], ["Trivy", "https://github.com/aquasecurity/trivy"], ["Gitleaks", "https://github.com/gitleaks/gitleaks"], ["OWASP ZAP", "https://www.zaproxy.org"], ["Qdrant", "https://github.com/qdrant/qdrant"], ["Mem0", "https://github.com/mem0ai/mem0"], ["Twenty CRM", "https://github.com/twentyhq/twenty"],
] as const;
type Result = Awaited<ReturnType<typeof runJarvisDiagnosticTool>>;

export function FreeToolsPanel() {
  const readinessFn = useServerFn(getJarvisFreeToolReadiness);
  const run = useServerFn(runJarvisDiagnosticTool);
  const readiness = useQuery({ queryKey: ["jarvis", "free-tool-readiness"], queryFn: () => readinessFn(), staleTime: 60000, retry: false });
  const [target, setTarget] = useState("https://revoragrowthsystems.com/");
  const [query, setQuery] = useState("tanstack start: server functions");
  const [photoQuery, setPhotoQuery] = useState("auto detailing foam wash");
  const [sheetUrl, setSheetUrl] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [strategy, setStrategy] = useState("mobile");
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [error, setError] = useState<string | null>(null);
  const check = async (toolId: string) => {
    setRunning(toolId);
    setError(null);
    try {
      const args = toolId === "docs.lookup" ? { query } : toolId === "images.stock.search" ? { query: photoQuery } : toolId === "workspace.sheets.read" ? { query: sheetUrl } : toolId === "web.page.read" ? { target: pageUrl } : toolId === "website.dns.lookup" || toolId === "domain.rdap.lookup" || toolId === "domain.wayback.history" ? { query: target } : { target, strategy };
      const result = await run({ data: { toolId, args } });
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
      <label className="block space-y-1 text-xs">Google Sheets link<Input aria-label="Google Sheets link" placeholder="https://docs.google.com/spreadsheets/d/…" value={sheetUrl} onChange={(event) => setSheetUrl(event.target.value)} /></label>
      <label className="block space-y-1 text-xs">Public page to read<Input aria-label="Public page to read" placeholder="https://example.com/article" value={pageUrl} onChange={(event) => setPageUrl(event.target.value)} /></label>
      <label className="block space-y-1 text-xs">Photo search<Input aria-label="Stock photo search" value={photoQuery} onChange={(event) => setPhotoQuery(event.target.value)} /></label>
      {tools.map((tool) => {
        const result = results[tool.id];
        const reason = result?.data && typeof result.data === "object" && !Array.isArray(result.data) && "reason" in result.data ? result.data["reason"] : null;
        const entry = readiness.data?.tools[tool.id];
        const runnable = entry?.ready === true;
        const status = reason === "free_quota_exhausted" ? "Quota reached" : result ? result.status === "observed" ? "Checked" : result.status === "failed" ? "Issues found" : "Unavailable" : entry ? `${STATE_LABEL[entry.state]}${entry.state === "needs_key" && entry.secretName ? ` · ${entry.secretName}` : ""}` : "Not checked";
        const previous = result ? null : lastRunText(entry);
        const Icon = tool.icon;
        return <div key={tool.id} className="border-t border-border pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0"><p className="flex items-center gap-2 text-sm font-medium"><Icon className="size-4" aria-hidden />{tool.title}</p><p className="text-xs text-muted-foreground" role="status">{running === tool.id ? "Checking…" : status}</p>{previous ? <p className="text-xs text-muted-foreground">{previous}</p> : null}</div>
            <Button size="icon" variant="outline" aria-label={`Run ${tool.title}`} title={`Run ${tool.title}`} disabled={running !== null || !runnable} onClick={() => { void check(tool.id); }}><Play className="size-4" aria-hidden /></Button>
          </div>
          {result ? <div className="mt-2 space-y-2"><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(result.data, null, 2)}</pre><p className="text-xs text-muted-foreground">{result.limitations.join(" ")}</p></div> : null}
        </div>;
      })}
      <div className="border-t border-border pt-3">
        <p className="text-sm font-medium">Picture services</p>
        <ul className="mt-2 space-y-1 text-xs">
          {services.map((service) => {
            const entry = readiness.data?.tools[service.id];
            return <li key={service.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{service.label}</span>
              {entry?.state === "needs_key" ? <a className="underline underline-offset-2" href={service.link} target="_blank" rel="noreferrer">Needs {service.key} · get key</a> : entry ? <span className="text-muted-foreground">{STATE_LABEL[entry.state]}</span> : <span className="text-muted-foreground">Unknown</span>}
            </li>;
          })}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Hugging Face and Pollinations have no picture path in Revora, so a saved key for them would not make pictures.</p>
      </div>
      <div className="border-t border-border pt-3">
        <p className="text-sm font-medium">Needs a server (later)</p>
        <p className="mt-1 text-xs text-muted-foreground">These free tools run on their own computer or GPU, not inside Revora.</p>
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {serverTools.map(([label, href]) => <li key={label}><a className="underline underline-offset-2" href={href} target="_blank" rel="noreferrer">{label}</a></li>)}
        </ul>
      </div>
      {readiness.data && !readiness.data.runsRecorded ? <p className="text-xs text-muted-foreground">Run history unavailable; last results are unknown, not passed.</p> : null}
      {readiness.error || error ? <p role="alert" className="text-xs text-destructive">{error ?? "Tool settings unavailable."}</p> : null}
    </div>
  </details>;
}