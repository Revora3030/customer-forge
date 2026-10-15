import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageResponse } from "@/components/ai-elements/message";
import { clearJarvisHistory, getJarvisHistory, getJarvisDiagnostics, getJarvisAccessSnapshot, getJarvisDiagnosticTools, runJarvisDiagnosticTool, sendJarvisMessage } from "@/lib/jarvis.functions";

type Recognition = {
  lang: string; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start: () => void; stop: () => void;
};
type RecognitionConstructor = new () => Recognition;

export const Route = createFileRoute("/_authenticated/admin/jarvis")({
  head: () => ({ meta: [{ title: "Jarvis mission control — Revora" }, { name: "robots", content: "noindex" }] }),
  component: Jarvis,
});

const MAX_LENGTH = 4000;

const COMMAND_GROUPS = [
  { group: "Diagnose", items: [
    ["Daily briefing", "Give me a daily briefing: the top three priorities from the diagnostics, what looks fine, what is at risk, and the single most valuable action today. Label anything not checked."],
    ["Platform errors", "Analyze observed error groups. Separate facts, hypotheses, and missing evidence."],
    ["Builder health", "Analyze build and publish health. Do not guess the cause of stalled progress."],
    ["SEO readiness", "Explain the HTTP and metadata checks and what still needs Search Console verification."],
  ] },
  { group: "Grow", items: [
    ["Growth strategy", "Draft a weekly customer-acquisition plan from available figures. Label assumptions."],
    ["Offer review", "Review my offer ($350 setup, first month free, then $100/month, 3-day trial) for conversion weaknesses and suggest A/B tests. Do not invent numbers."],
    ["Outreach drafts", "Draft three short cold emails for Raleigh-area local service businesses offering the Revora website and CRM. No phone numbers, no invented results or reviews."],
    ["Reel scripts", "Write five short-form reel scripts that promote Revora to local business owners. No invented testimonials or results."],
  ] },
  { group: "Build", items: [
    ["Lovable fix prompt", "Turn the observed issues into one copy-paste Lovable prompt for my review. Only include fixes supported by the evidence."],
  ] },
] as const;

function Jarvis() {
  const qc = useQueryClient();
  const load = useServerFn(getJarvisHistory);
  const inspect = useServerFn(getJarvisDiagnostics);\n  const inspectAccess = useServerFn(getJarvisAccessSnapshot);\n  const loadTools = useServerFn(getJarvisDiagnosticTools);\n  const runTool = useServerFn(runJarvisDiagnosticTool);
  const send = useServerFn(sendJarvisMessage);
  const clear = useServerFn(clearJarvisHistory);
  const history = useQuery({ queryKey: ["jarvis", "history"], queryFn: () => load() });
  const diagnostics = useQuery({ queryKey: ["jarvis", "diagnostics"], queryFn: () => inspect(), enabled: false, retry: false });\n  const access = useQuery({ queryKey: ["jarvis", "access"], queryFn: () => inspectAccess(), enabled: false, retry: false });\n  const toolCatalog = useQuery({ queryKey: ["jarvis", "tool-catalog"], queryFn: () => loadTools(), retry: false });\n  const [toolResults, setToolResults] = useState<Record<string, unknown>>({});\n  const toolRun = useMutation({\n    mutationFn: (toolId: string) => runTool({ data: { toolId } }),\n    onSuccess: (result, toolId) => setToolResults((previous) => ({ ...previous, [toolId]: result })),\n    onError: (error: Error) => toast.error(error.message),\n  });
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [followups, setFollowups] = useState<string[]>([]);
  const [voice, setVoice] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const mutation = useMutation({
    mutationFn: (message: string) => send({ data: { message } }),
    onSuccess: async (result) => {
      qc.setQueryData(["jarvis", "diagnostics"], result.diagnostics);
      setFollowups(result.followups ?? []);
      await qc.invalidateQueries({ queryKey: ["jarvis", "history"] });
      if (voice && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(result.reply.replace(/[#*_`>|]/g, " ").slice(0, 1500)));
      }
    },
    onError: (error: Error, message: string) => { toast.error(error.message); setText((current) => current || message); },
    onSettled: () => setPending(null),
  });
  const clearing = useMutation({
    mutationFn: () => clear(),
    onSuccess: () => { setFollowups([]); return qc.invalidateQueries({ queryKey: ["jarvis", "history"] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [history.data?.length, mutation.isPending, pending, followups.length]);
  useEffect(() => () => {
    if (recognition.current) {
      recognition.current.onresult = null;
      recognition.current.onend = null;
      recognition.current.onerror = null;
      recognition.current.stop();
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);
  const submit = (message = text) => {
    const clean = message.trim();
    if (!clean || mutation.isPending) return;
    recognition.current?.stop();
    setText("");
    setFollowups([]);
    setPending(clean);
    mutation.mutate(clean);
  };
  const copy = async (content: string) => {
    try { await navigator.clipboard.writeText(content); toast.success("Copied."); } catch { toast.error("Copy failed."); }
  };
  const toggleMic = () => {
    if (listening) { recognition.current?.stop(); return; }
    const browser = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Ctor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Ctor) { toast.error("Voice input is unavailable; use text instead."); return; }
    const rec = new Ctor();
    rec.lang = "en-US"; rec.interimResults = false;
    rec.onresult = (event) => setText(String(event.results[0]?.[0]?.transcript ?? ""));
    rec.onend = () => setListening(false);
    rec.onerror = () => { setListening(false); toast.error("Voice input failed. You can still type."); };
    recognition.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); toast.error("Microphone could not start."); }
  };
  const messages = history.data ?? [];
  const empty = !history.isLoading && !history.error && messages.length === 0 && !pending;
  return (
    <div className="product-page flex min-h-[70dvh] flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Jarvis mission control</h1><p className="text-sm text-muted-foreground">Read-only diagnostics and free-only AI advice. No automatic repairs.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={diagnostics.isFetching} onClick={() => { void diagnostics.refetch(); }}>Refresh diagnostics</Button>\n          <Button variant="outline" disabled={access.isFetching} onClick={() => { void access.refetch(); }}>Refresh access status</Button>
          <Button variant="outline" aria-pressed={voice} onClick={() => { setVoice(!voice); window.speechSynthesis?.cancel(); }}>{voice ? "Mute replies" : "Speak replies"}</Button>
          <Button variant="outline" disabled={clearing.isPending || mutation.isPending} onClick={() => { if (window.confirm("Clear your Jarvis history?")) clearing.mutate(); }}>Clear my chat</Button>
        </div>
      </header>
      <section aria-label="Access and permissions" className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">Access &amp; permissions</h2>
            <p className="text-xs text-muted-foreground">Configuration evidence only—not proof that a live connector is healthy. Secret values and credential names are never displayed.</p>
          </div>
          <Button variant="outline" size="sm" disabled={access.isFetching} onClick={() => { void access.refetch(); }}>Check connectors</Button>
        </div>
        {access.error ? <p role="alert" className="mt-3 text-sm">Access status unavailable. No connection-health verdict can be inferred.</p> : null}
        {access.data ? <>
          <p className="mt-2 text-xs text-muted-foreground">Checked {access.data.checkedAt}. Runtime verification is process-local and may reset after restart.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {access.data.providers.map((provider) => <article key={provider.id} className="min-w-0 rounded-md border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium">{provider.label}</h3>
                <span className="shrink-0 rounded bg-muted px-2 py-1 text-xs">{provider.status.replaceAll("_", " ")}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{provider.permission}</p>
              <dl className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between gap-2"><dt>Scope</dt><dd>{provider.scope}</dd></div>
                <div className="flex justify-between gap-2"><dt>Cost class</dt><dd>{provider.cost}</dd></div>
                <div className="flex justify-between gap-2"><dt>Implemented</dt><dd>{provider.implemented ? "Yes" : "No"}</dd></div>
                <div className="flex justify-between gap-2"><dt>Runtime success seen</dt><dd>{provider.runtimeVerifiedInThisProcess ? "Yes" : "Not verified"}</dd></div>
                <div className="flex justify-between gap-2"><dt>Missing credentials</dt><dd>{provider.missingCredentialCount === 0 ? "None detected" : `${provider.missingCredentialCount} required`}</dd></div>
              </dl>
            </article>)}
          </div>
        </> : <p className="mt-3 text-sm text-muted-foreground">Connector status has not been checked yet.</p>}
      </section>
      <section aria-label="Allowlisted read-only Jarvis tools" className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">Diagnostic toolbench</h2>
            <p className="text-xs text-muted-foreground">Registered, bounded, read-only tools. No generic SQL, shell, code execution, billing, messaging, or publishing tools are available here.</p>
          </div>
          <Button variant="outline" size="sm" disabled={toolCatalog.isFetching} onClick={() => { void toolCatalog.refetch(); }}>Refresh tool catalog</Button>
        </div>
        {toolCatalog.error ? <p role="alert" className="mt-3 text-sm">Tool catalog unavailable. No tool was executed.</p> : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(toolCatalog.data ?? []).map((tool) => {
            const output = toolResults[tool.id];
            return <article key={tool.id} className="min-w-0 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-medium">{tool.title}</h3>
                <span className="rounded bg-muted px-2 py-1 text-xs">{tool.implementation === "partial" ? "Partial evidence" : "Read-only"}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{tool.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">Evidence: {tool.evidence}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" disabled={toolRun.isPending} onClick={() => toolRun.mutate(tool.id)}>{toolRun.isPending ? "Running diagnostic…" : "Run diagnostic"}</Button>
                <span className="text-xs text-muted-foreground">Read-only; no changes are made.</span>
              </div>
              {output !== undefined ? <details className="mt-3">
                <summary className="cursor-pointer text-sm">View last result</summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">{JSON.stringify(output, null, 2)}</pre>
              </details> : null}
            </article>;
          })}
        </div>
      </section>
      <section aria-label="Diagnostic status" className="grid gap-3 sm:grid-cols-3">
        {["errors", "builds", "schema"].map((name) => {
          const section = diagnostics.data?.sections[name];
          return <div key={name} className="rounded-lg border border-border bg-card p-3"><h2 className="font-medium capitalize">{name}</h2><p className="text-sm">{section?.status ?? "not checked"}</p><p className="text-xs text-muted-foreground">{section?.note ?? "Run diagnostics to collect evidence."}</p></div>;
        })}
      </section>
      <p className="text-xs text-muted-foreground">Snapshot: {diagnostics.data?.checkedAt ?? "not collected"}. “Checked” means the query ran—not that the subsystem is healthy.</p>
      {diagnostics.error ? <p role="alert">Diagnostics unavailable. No healthy verdict can be inferred.</p> : null}
      <div className="flex flex-col gap-2">
        {COMMAND_GROUPS.map((section) => (
          <div key={section.group} className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-xs font-medium uppercase tracking-wide text-muted-foreground">{section.group}</span>
            {section.items.map(([label, prompt]) => <Button key={label} variant="outline" size="sm" disabled={mutation.isPending} onClick={() => submit(prompt)}>{label}</Button>)}
          </div>
        ))}
      </div>
      {diagnostics.data ? <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer">Inspect bounded diagnostic evidence</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(diagnostics.data, null, 2)}</pre></details> : null}
      <section aria-label="Jarvis conversation" aria-live="polite" className="min-h-64 max-h-[55dvh] flex-1 space-y-4 overflow-y-auto rounded-lg border border-border bg-card p-4">
        {history.isLoading ? <p>Loading your conversation…</p> : null}
        {history.error ? <p role="alert">Your conversation could not be loaded.</p> : null}
        {empty ? <div className="space-y-1 py-6 text-center"><p className="text-lg font-medium">What are we working on?</p><p className="text-sm text-muted-foreground">Ask for a briefing, a strategy, copy, a Lovable prompt, or a second opinion. Pick a command above or just type.</p></div> : null}
        {messages.map((message) => (
          <article key={message.id} className="min-w-0">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{message.role === "user" ? "You" : "Jarvis"}</p>
              {message.role === "assistant" ? <Button type="button" variant="ghost" size="sm" onClick={() => { void copy(message.content); }}>Copy</Button> : null}
            </div>
            <MessageResponse>{message.content}</MessageResponse>
          </article>
        ))}
        {pending ? <article className="min-w-0"><p className="mb-1 text-xs text-muted-foreground">You</p><MessageResponse>{pending}</MessageResponse></article> : null}
        {mutation.isPending ? <p className="text-sm text-muted-foreground">Collecting diagnostics and asking the free AI team…</p> : null}
        {followups.length > 0 && !mutation.isPending ? <div className="flex flex-wrap gap-2">{followups.map((item) => <Button key={item} type="button" variant="secondary" size="sm" onClick={() => submit(item)}>{item}</Button>)}</div> : null}
        <div ref={end} />
      </section>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <label htmlFor="jarvis-message" className="sr-only">Message Jarvis</label>
        <Textarea
          id="jarvis-message" value={text} maxLength={MAX_LENGTH} onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }}
          className="min-w-0 flex-1" rows={3} placeholder="Ask anything: errors, strategy, copy, prompts, code, decisions…"
        />
        <Button type="button" variant="outline" aria-pressed={listening} disabled={mutation.isPending} onClick={toggleMic}>{listening ? "Stop microphone" : "Dictate"}</Button>
        <Button type="submit" disabled={!text.trim() || mutation.isPending}>Send</Button>
        <p className="w-full text-right text-xs text-muted-foreground">{text.length}/{MAX_LENGTH} · Enter to send, Shift+Enter for a new line</p>
      </form>
    </div>
  );
}
