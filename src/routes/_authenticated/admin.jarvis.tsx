import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageResponse } from "@/components/ai-elements/message";
import { clearJarvisHistory, getJarvisHistory, getJarvisDiagnostics, getJarvisAccessSnapshot, sendJarvisMessage } from "@/lib/jarvis.functions";

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

const COMMANDS = [
  ["Platform errors", "Analyze observed error groups. Separate facts, hypotheses, and missing evidence."],
  ["Builder health", "Analyze build and publish health. Do not guess the cause of stalled progress."],
  ["SEO readiness", "Explain the HTTP and metadata checks and what still needs Search Console verification."],
  ["Growth strategy", "Draft a weekly customer-acquisition plan from available figures. Label assumptions."],
] as const;

function Jarvis() {
  const qc = useQueryClient();
  const load = useServerFn(getJarvisHistory);
  const inspect = useServerFn(getJarvisDiagnostics);\n  const inspectAccess = useServerFn(getJarvisAccessSnapshot);
  const send = useServerFn(sendJarvisMessage);
  const clear = useServerFn(clearJarvisHistory);
  const history = useQuery({ queryKey: ["jarvis", "history"], queryFn: () => load() });
  const diagnostics = useQuery({ queryKey: ["jarvis", "diagnostics"], queryFn: () => inspect(), enabled: false, retry: false });\n  const access = useQuery({ queryKey: ["jarvis", "access"], queryFn: () => inspectAccess(), enabled: false, retry: false });
  const [text, setText] = useState("");
  const [voice, setVoice] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const mutation = useMutation({
    mutationFn: (message: string) => send({ data: { message } }),
    onSuccess: async (result) => {
      qc.setQueryData(["jarvis", "diagnostics"], result.diagnostics);
      await qc.invalidateQueries({ queryKey: ["jarvis", "history"] });
      if (voice && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(result.reply.replace(/[#*_`>|]/g, " ").slice(0, 1500)));
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const clearing = useMutation({
    mutationFn: () => clear(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jarvis", "history"] }),
    onError: (error: Error) => toast.error(error.message),
  });
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [history.data?.length, mutation.isPending]);
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
    if (!message.trim() || mutation.isPending) return;
    recognition.current?.stop();
    setText("");
    mutation.mutate(message.trim());
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
      <section aria-label="Diagnostic status" className="grid gap-3 sm:grid-cols-3">
        {["errors", "builds", "schema"].map((name) => {
          const section = diagnostics.data?.sections[name];
          return <div key={name} className="rounded-lg border border-border bg-card p-3"><h2 className="font-medium capitalize">{name}</h2><p className="text-sm">{section?.status ?? "not checked"}</p><p className="text-xs text-muted-foreground">{section?.note ?? "Run diagnostics to collect evidence."}</p></div>;
        })}
      </section>
      <p className="text-xs text-muted-foreground">Snapshot: {diagnostics.data?.checkedAt ?? "not collected"}. “Checked” means the query ran—not that the subsystem is healthy.</p>
      <section aria-label="Access and permissions" className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">Access &amp; permissions</h2>
            <p className="text-xs text-muted-foreground">Configuration evidence only—not proof that a live service is healthy. Secret values and credential names are never shown.</p>
          </div>
          <Button variant="outline" size="sm" disabled={access.isFetching} onClick={() => { void access.refetch(); }}>Check connectors</Button>
        </div>
        {access.error ? <p role="alert" className="mt-3 text-sm">Access status unavailable. No connection health verdict can be inferred.</p> : null}
        {access.data ? <>
          <p className="mt-2 text-xs text-muted-foreground">Checked {access.data.checkedAt}. Runtime verification is process-local and may reset on restart.</p>
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
                <div className="flex justify-between gap-2"><dt>Runtime call verified</dt><dd>{provider.runtimeVerified ? "Previously verified" : "Not verified"}</dd></div>
                <div className="flex justify-between gap-2"><dt>Missing credentials</dt><dd>{provider.missingCredentialCount === 0 ? "None detected" : `${provider.missingCredentialCount} required`}</dd></div>
              </dl>
            </article>)}
          </div>
        </> : <p className="mt-3 text-sm text-muted-foreground">Access has not been checked yet.</p>}
      </section>
      {diagnostics.error ? <p role="alert">Diagnostics unavailable. No healthy verdict can be inferred.</p> : null}
      <div className="flex flex-wrap gap-2">{COMMANDS.map(([label, prompt]) => <Button key={label} variant="outline" disabled={mutation.isPending} onClick={() => submit(prompt)}>{label}</Button>)}</div>
      {diagnostics.data ? <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer">Inspect bounded diagnostic evidence</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(diagnostics.data, null, 2)}</pre></details> : null}
      <section aria-label="Jarvis conversation" aria-live="polite" className="min-h-64 max-h-[55dvh] flex-1 space-y-4 overflow-y-auto rounded-lg border border-border bg-card p-4">
        {history.isLoading ? <p>Loading your conversation…</p> : null}
        {history.error ? <p role="alert">Your conversation could not be loaded.</p> : null}
        {(history.data ?? []).map((message) => <article key={message.id} className="min-w-0"><p className="mb-1 text-xs text-muted-foreground">{message.role === "user" ? "You" : "Jarvis"}</p><MessageResponse>{message.content}</MessageResponse></article>)}
        {mutation.isPending ? <p>Collecting diagnostics and asking the free AI team…</p> : null}
        <div ref={end} />
      </section>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <label htmlFor="jarvis-message" className="sr-only">Message Jarvis</label>
        <Textarea id="jarvis-message" value={text} maxLength={4000} onChange={(event) => setText(event.target.value)} className="min-w-0 flex-1" rows={3} placeholder="Ask about observed errors, builder health, or growth…" />
        <Button type="button" variant="outline" aria-pressed={listening} disabled={mutation.isPending} onClick={toggleMic}>{listening ? "Stop microphone" : "Dictate"}</Button>
        <Button type="submit" disabled={!text.trim() || mutation.isPending}>Send</Button>
      </form>
    </div>
  );
}
