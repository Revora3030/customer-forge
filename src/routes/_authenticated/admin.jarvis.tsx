import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, Ban, Bot, Copy, Download, Megaphone, Mic, MicOff, RefreshCw, RotateCcw, Send, Trash2, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageResponse } from "@/components/ai-elements/message";
import { clearJarvisHistory, getJarvisHistory, getJarvisDiagnostics, getJarvisAcquisitionReadiness, getJarvisDiagnosticTools, runJarvisDiagnosticTool, regenerateJarvisReply, sendJarvisMessage } from "@/lib/jarvis.functions";
import { draftProspectOutreach, type ProspectDraft } from "@/lib/jarvis-prospecting.functions";
import { formatRevoraOffer } from "@/lib/jarvis-acquisition-policy";
import { synthesizeJarvisVoice } from "@/lib/jarvis-voice.functions";
import { ProspectDemoBuilder } from "@/components/app/ProspectDemoBuilder";

type Recognition = {
  lang: string; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start: () => void; stop: () => void;
};
type RecognitionConstructor = new () => Recognition;
type Mode = "brief" | "balanced" | "deep";
type ProspectLine = { name: string; website: string; city: string; email: string };

type CapabilityScorePayload = {
  overallScore: number;
  verifiedChecks: number;
  totalChecks: number;
  verified10Of10Areas: number;
  areas: Array<{
    id: string;
    title: string;
    score: number;
    verified: number;
    total: number;
    status: "verified_10_of_10" | "gaps_found" | "evidence_incomplete";
    blockers: string[];
  }>;
  nextActions: string[];
};

export const Route = createFileRoute("/_authenticated/admin/jarvis")({
  head: () => ({ meta: [{ title: "Jarvis mission control — Revora" }, { name: "robots", content: "noindex" }] }),
  component: Jarvis,
});

const MAX_LENGTH = 4000;
const DRAFT_KEY = "jarvis:draft";
const MODE_KEY = "jarvis:mode";
const DNC_KEY = "jarvis:dnc";
const ADDRESS_PLACEHOLDER = "[ADD YOUR PHYSICAL MAILING ADDRESS";
const MODES = [["brief", "Brief"], ["balanced", "Balanced"], ["deep", "Deep"]] as const;
const SECTIONS = [["errors", "Errors"], ["builds", "Builds"], ["schema", "Schema"]] as const;

const BRIEFING = "Give me a daily briefing: the top three priorities from the diagnostics, what looks fine, what is at risk, and the single most valuable action today. Label anything not checked.";
const AUDIT = "Audit my homepage HTTP and metadata checks and give me the exact fixes in priority order. Say what is not proven.";
const OFFER = `Review my offer (${formatRevoraOffer()}) for conversion weaknesses and suggest tests sized for low traffic. Do not invent numbers.`;
const OUTREACH = "Draft three short cold emails for Raleigh-area local service businesses offering the Revora website and CRM. No phone numbers, no invented results or reviews.";
const RULES = "Legal and honest only: cold email needs an honest sender, a physical mailing address, and an opt-out; no cold texts or auto-dialed calls without prior consent; no purchased lists, fake reviews, or deceptive subject lines.";
const AUTOPILOT = `Build my customer-acquisition autopilot plan for this week. Split it into what Jarvis can draft for me, what needs my approval before anything goes out, and what I must do myself. Include the daily routine, the numbers to track (prospects found, emails approved, replies, trials started, paid customers), and a realistic expectation for low volume. ${RULES}`;
const PROSPECT_IDEAS = `List ten types of Raleigh and Chapel Hill local service businesses most likely to buy a website with this offer: ${formatRevoraOffer()} with built-in quotes, booking and follow-up, and how to find each type legally (Google Maps, chamber directories, Yelp). Do not suggest scraping that breaks a site's terms. ${RULES}`;
const FOLLOW_UP = `Design a three-touch email follow-up sequence for prospects who did not reply, spaced over two weeks, each under 80 words, each with an easy opt-out. ${RULES}`;

const COMMANDS = [
  ["Daily briefing", BRIEFING],
  ["Autopilot plan", AUTOPILOT],
  ["Prospect ideas", PROSPECT_IDEAS],
  ["Follow-up sequence", FOLLOW_UP],
  ["Platform errors", "Analyze observed error groups. Separate facts, hypotheses, and missing evidence."],
  ["Builder health", "Analyze build and publish health. Do not guess the cause of stalled progress."],
  ["SEO readiness", "Explain the HTTP and metadata checks and what still needs Search Console verification."],
  ["Site audit", AUDIT],
  ["Growth strategy", "Draft a weekly customer-acquisition plan from available figures. Label assumptions."],
  ["Offer review", OFFER],
  ["Outreach drafts", OUTREACH],
  ["Local SEO plan", "Build a 30-day local SEO plan for Revora targeting Raleigh and Chapel Hill service businesses. Use only steps I can verify and label assumptions."],
  ["Reel scripts", "Write five short-form reel scripts that promote Revora to local business owners. No invented testimonials or results."],
  ["Lovable fix prompt", "Turn the observed issues into one copy-paste Lovable prompt for my review. Only include fixes supported by the evidence."],
] as const;

const STARTERS = [
  ["Daily briefing", "What matters today, ranked by impact", BRIEFING],
  ["Autopilot plan", "This week's customer-acquisition routine", AUTOPILOT],
  ["Offer review", "Find conversion leaks in the $350 setup offer", OFFER],
  ["Outreach drafts", "Three emails for Raleigh-area businesses", OUTREACH],
] as const;

const parseProspects = (raw: string): ProspectLine[] =>
  raw.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 5).map((line) => {
    const [name = "", website = "", city = "", email = ""] = line.split("|").map((part) => part.trim());
    return { name, website, city, email };
  }).filter((item) => item.name);

const hostFromUrl = (value: string | null) => {
  if (!value) return null;
  try { return new URL(value).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
};

const clock = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};
const dot = (status?: string) => status === "checked" ? "bg-emerald-500" : status === "unavailable" ? "bg-destructive" : "bg-muted-foreground/50";

function Jarvis() {
  const qc = useQueryClient();
  const load = useServerFn(getJarvisHistory);
  const inspect = useServerFn(getJarvisDiagnostics);
  const inspectAcquisition = useServerFn(getJarvisAcquisitionReadiness);
  const loadDiagnosticTools = useServerFn(getJarvisDiagnosticTools);
  const runDiagnosticTool = useServerFn(runJarvisDiagnosticTool);
  const send = useServerFn(sendJarvisMessage);
  const redo = useServerFn(regenerateJarvisReply);
  const clear = useServerFn(clearJarvisHistory);
  const synthesizeVoice = useServerFn(synthesizeJarvisVoice);
  const draftFn = useServerFn(draftProspectOutreach);
  const history = useQuery({ queryKey: ["jarvis", "history"], queryFn: () => load() });
  const diagnostics = useQuery({ queryKey: ["jarvis", "diagnostics"], queryFn: () => inspect(), staleTime: 60_000, retry: false });
  const acquisition = useQuery({ queryKey: ["jarvis", "acquisition-readiness"], queryFn: () => inspectAcquisition(), enabled: false, retry: false });
  const capabilityScorecard = useQuery({
    queryKey: ["jarvis", "capability-scorecard"],
    queryFn: async () => {
      const tools = await loadDiagnosticTools();
      if (!tools.some((tool) => tool.id === "jarvis.capabilities.scorecard")) {
        throw new Error("The capability scorecard is not available on this release.");
      }
      return runDiagnosticTool({ data: { toolId: "jarvis.capabilities.scorecard" } });
    },
    enabled: false,
    retry: false,
    staleTime: 0,
  });
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("balanced");
  const [pending, setPending] = useState<string | null>(null);
  const [followups, setFollowups] = useState<string[]>([]);
  const [voice, setVoice] = useState(false);
  const [listening, setListening] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [prospectText, setProspectText] = useState("");
  const [drafts, setDrafts] = useState<ProspectDraft[]>([]);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [dnc, setDnc] = useState<string[]>([]);
  const [addressConfigured, setAddressConfigured] = useState(true);
  const recognition = useRef<Recognition | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const stopVoice = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  };
  const speak = async (content: string) => {
    const clean = content.replace(/<followups>[\s\S]*?<\/followups>/gi, " ").replace(/[#*_\x60>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200);
    if (!clean) { toast.error("There is no readable text to speak."); return; }
    stopVoice();
    try {
      const result = await synthesizeVoice({ data: { text: clean } });
      const binary = window.atob(result.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const url = URL.createObjectURL(new Blob([bytes], { type: result.contentType }));
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { if (audioUrlRef.current === url) { URL.revokeObjectURL(url); audioUrlRef.current = null; audioRef.current = null; } };
      audio.onerror = () => { if (audioUrlRef.current === url) { URL.revokeObjectURL(url); audioUrlRef.current = null; audioRef.current = null; } };
      await audio.play();
    } catch (error) {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(clean));
        toast.message("Using your browser voice because ElevenLabs was unavailable.", {
          description: error instanceof Error ? error.message : undefined,
        });
      } else toast.error(error instanceof Error ? error.message : "Jarvis voice could not be played.");
    }
  };
  const finish = async (result: { reply: string; diagnostics: unknown; followups?: string[] }) => {
    qc.setQueryData(["jarvis", "diagnostics"], result.diagnostics);
    setFollowups(result.followups ?? []);
    await qc.invalidateQueries({ queryKey: ["jarvis", "history"] });
    if (voice) speak(result.reply);
  };
  const mutation = useMutation({
    mutationFn: (message: string) => send({ data: { message, mode } }),
    onSuccess: finish,
    onError: (error: Error, message: string) => { toast.error(error.message); setText((current) => current || message); },
    onSettled: () => setPending(null),
  });
  const regen = useMutation({
    mutationFn: () => redo({ data: { mode } }),
    onSuccess: finish,
    onError: (error: Error) => toast.error(error.message),
  });
  const clearing = useMutation({
    mutationFn: () => clear(),
    onSuccess: () => { setFollowups([]); return qc.invalidateQueries({ queryKey: ["jarvis", "history"] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  const prospecting = useMutation({
    mutationFn: (prospects: ProspectLine[]) => draftFn({ data: { prospects, suppress: dnc } }),
    onSuccess: (result) => { setDrafts(result.drafts); setEdits({}); setAddressConfigured(result.mailingAddressConfigured); },
    onError: (error: Error) => toast.error(error.message),
  });
  const busy = mutation.isPending || regen.isPending;
  const messages = history.data ?? [];
  const lastMessage = messages[messages.length - 1];
  const lastAssistantId = lastMessage?.role === "assistant" ? lastMessage.id : null;
  const empty = !history.isLoading && !history.error && messages.length === 0 && !pending;
  const stage = elapsed < 3 ? "Collecting diagnostics" : elapsed < 8 ? "Checking the live site" : "Thinking it through";
  const prospectLines = parseProspects(prospectText);

  useEffect(() => {
    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) setText(draft.slice(0, MAX_LENGTH));
      const saved = localStorage.getItem(MODE_KEY);
      if (saved === "brief" || saved === "balanced" || saved === "deep") setMode(saved);
      const rawDnc = localStorage.getItem(DNC_KEY);
      if (rawDnc) {
        const parsed: unknown = JSON.parse(rawDnc);
        if (Array.isArray(parsed)) setDnc(parsed.filter((item): item is string => typeof item === "string").slice(0, 500));
      }
    } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    try { if (text) localStorage.setItem(DRAFT_KEY, text); else localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ }
    const el = input.current;
    if (el) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; }
  }, [text]);
  useEffect(() => {
    if (!busy) { setElapsed(0); return; }
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => { if (atBottom) end.current?.scrollIntoView({ block: "end" }); }, [history.data?.length, busy, pending, followups.length, atBottom]);
  useEffect(() => () => {
    if (recognition.current) {
      recognition.current.onresult = null;
      recognition.current.onend = null;
      recognition.current.onerror = null;
      recognition.current.stop();
    }
    stopVoice();
  }, []);

  const onScroll = () => {
    const el = scroller.current;
    if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };
  const chooseMode = (value: Mode) => {
    setMode(value);
    try { localStorage.setItem(MODE_KEY, value); } catch { /* storage unavailable */ }
  };
  const saveDnc = (next: string[]) => {
    setDnc(next);
    try { localStorage.setItem(DNC_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };
  const suppressDraft = (draft: ProspectDraft) => {
    const entry = draft.email ?? hostFromUrl(draft.website);
    if (!entry) { toast.error("Nothing to block: this prospect has no email or website."); return; }
    if (!dnc.includes(entry)) saveDnc([...dnc, entry]);
    toast.success(`${entry} added to do-not-contact.`);
  };
  const submit = (message = text) => {
    const clean = message.trim();
    if (!clean || busy) return;
    recognition.current?.stop();
    setText("");
    setFollowups([]);
    setAtBottom(true);
    setPending(clean);
    mutation.mutate(clean);
  };
  const copy = async (content: string) => {
    try { await navigator.clipboard.writeText(content); toast.success("Copied."); } catch { toast.error("Copy failed."); }
  };
  const exportChat = () => {
    if (!messages.length) { toast.error("Nothing to export yet."); return; }
    const markdown = messages.map((message) => `### ${message.role === "user" ? "You" : "Jarvis"} · ${new Date(message.created_at).toLocaleString()}\n\n${message.content}`).join("\n\n---\n\n");
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `jarvis-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
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
    <div className="product-page flex min-h-[70dvh] flex-col gap-3">
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"><Bot className="size-5" aria-hidden /></span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold leading-tight">Jarvis</h1>
            <p className="truncate text-xs text-muted-foreground">Mission control · read-only · free AI · you approve every send</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label="Refresh diagnostics" title="Refresh diagnostics" disabled={diagnostics.isFetching} onClick={() => { void diagnostics.refetch(); }}><RefreshCw className={`size-4 ${diagnostics.isFetching ? "animate-spin" : ""}`} /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label={voice ? "Mute replies" : "Speak replies"} aria-pressed={voice} title={voice ? "Mute replies" : "Speak replies"} onClick={() => { const next = !voice; setVoice(next); if (!next) stopVoice(); }}>{voice ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}</Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Export chat" title="Export chat as Markdown" onClick={exportChat}><Download className="size-4" /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Clear my chat" title="Clear my chat" disabled={clearing.isPending || busy} onClick={() => { if (window.confirm("Clear your Jarvis history?")) clearing.mutate(); }}><Trash2 className="size-4" /></Button>
        </div>
      </header>
      <section aria-label="Jarvis customer acquisition autopilot" className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="font-semibold">Customer acquisition autopilot</h2><p className="text-xs text-muted-foreground">Measure → qualify → prepare → approve → verify paid conversion. No guaranteed revenue claims.</p></div>
          <Button type="button" size="sm" variant="outline" disabled={acquisition.isFetching} onClick={() => { void acquisition.refetch(); }}>{acquisition.isFetching ? "Checking…" : "Check acquisition readiness"}</Button>
        </div>
        <p className="text-sm text-muted-foreground">Jarvis can prepare an evidence-backed daily plan and identify missing integrations. This check does not read prospect records, send messages, publish changes, or spend money.</p>
        {acquisition.data ? <div className="space-y-3">
          <div className="rounded-md border border-border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong>Readiness: {acquisition.data.status.replaceAll("_", " ")}</strong><span className="text-xs text-muted-foreground">Spend authorized: No · Sending enabled: No</span></div><p className="mt-1 text-xs text-muted-foreground">{acquisition.data.note}</p><p className="mt-2 text-xs">Verified signals: analytics {acquisition.data.analyticsVerified ? "yes" : "unknown"}, lead source {acquisition.data.liveLeadSourceVerified ? "yes" : "unknown"}, outbound provider {acquisition.data.outboundProviderVerified ? "yes" : "unknown"}, booking {acquisition.data.bookingVerified ? "yes" : "unknown"}, payment flow {acquisition.data.paymentFlowVerified ? "yes" : "unknown"}.</p><p className="mt-1 text-xs">Server-approved daily spend cap: {(acquisition.data.configuredSpendCapCents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })}; this run requested $0.</p></div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Observed funnel signals</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                ["Organizations", acquisition.data.funnelMetrics.organizationsTotal],
                ["Trial records", acquisition.data.funnelMetrics.trialRecordsTotal],
                ["Leads · 7 days", acquisition.data.funnelMetrics.leadsCreatedLast7Days],
                ["Appointments · 7 days", acquisition.data.funnelMetrics.appointmentsCreatedLast7Days],
                ["Paid invoices · 30 days", acquisition.data.funnelMetrics.paidInvoicesLast30Days],
                ["Active subscription records", acquisition.data.funnelMetrics.activeSubscriptionRecords],
              ].map(([label, value]) => <div key={String(label)} className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums">{value === null ? "Unknown" : value}</p></div>)}
            </div>
            <p className="text-xs text-muted-foreground">{acquisition.data.funnelMetrics.note}</p>
          </div>
          <ol className="space-y-2">{acquisition.data.steps.map((step) => <li key={step.id} className="rounded-md border border-border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{step.title}</strong><span className="text-xs text-muted-foreground">{step.mode.replaceAll("_", " ")}</span></div><p className="mt-1 text-xs text-muted-foreground">{step.reason}</p></li>)}</ol>
        </div> : acquisition.error ? <p role="alert" className="text-sm text-destructive">Acquisition readiness could not be verified. Treat all live integrations as unavailable.</p> : <p className="text-xs text-muted-foreground">Not checked yet. Jarvis will verify server-side connector evidence when requested.</p>}
      </section>


      <section aria-label="Jarvis seven-area capability scorecard" className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Jarvis capability scorecard</h2>
            <p className="text-xs text-muted-foreground">Seven capability areas · evidence-backed · missing proof never counts as a pass.</p>
          </div>
          <Button type="button" size="sm" variant="outline" disabled={capabilityScorecard.isFetching} onClick={() => { void capabilityScorecard.refetch(); }}>
            {capabilityScorecard.isFetching ? "Auditing…" : "Run seven-area audit"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">This reads bounded diagnostics, public-site smoke checks, and release-branch CI summaries. It does not enable writes, outreach, publishing, or spend.</p>
        {capabilityScorecard.data ? (() => {
          const toolResult = capabilityScorecard.data;
          const payload = toolResult.data as unknown as CapabilityScorePayload;
          const valid = payload && typeof payload === "object" && Array.isArray(payload.areas) &&
            typeof payload.overallScore === "number" && typeof payload.totalChecks === "number";
          return valid ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>Overall verified score: {payload.overallScore.toFixed(1)}/10</strong>
                  <span className="text-xs text-muted-foreground">{payload.verifiedChecks}/{payload.totalChecks} checks verified</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{payload.verified10Of10Areas}/7 areas fully verified · status: {toolResult.status.replaceAll("_", " ")}</p>
                <p className="mt-1 text-xs text-muted-foreground">Checked {clock(toolResult.checkedAt)} · {toolResult.durationMs} ms</p>
              </div>
              <div className="space-y-3">
                {payload.areas.map((area) => (
                  <article key={area.id} className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">{area.title}</span>
                      <span className="text-xs tabular-nums">{area.score.toFixed(1)}/10 · {area.verified}/{area.total}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={area.title} aria-valuemin={0} aria-valuemax={10} aria-valuenow={area.score}>
                      <div className="h-full rounded-full bg-primary" style={{ width: Math.min(100, Math.max(0, area.score * 10)) + "%" }} />
                    </div>
                    <p className="text-xs text-muted-foreground">{area.status.replaceAll("_", " ")}</p>
                    {area.blockers.length > 0 ? <details className="rounded-md border border-border px-2 py-1.5"><summary className="cursor-pointer text-xs">Show {area.blockers.length} evidence gaps</summary><ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">{area.blockers.slice(0, 8).map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></details> : <p className="text-xs text-muted-foreground">All required checks verified.</p>}
                  </article>
                ))}
              </div>
              {payload.nextActions.length > 0 ? <div className="rounded-lg border border-border p-3"><h3 className="text-sm font-semibold">Highest-priority next actions</h3><ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">{payload.nextActions.map((action) => <li key={action}>{action}</li>)}</ol></div> : null}
              <p className="text-xs text-muted-foreground">{toolResult.limitations.join(" ")}</p>
            </div>
          ) : <p role="alert" className="text-sm text-destructive">Jarvis returned a result that did not match the capability scorecard contract.</p>;
        })() : capabilityScorecard.error ? <p role="alert" className="text-sm text-destructive">Capability audit failed: {capabilityScorecard.error.message}. No area should be treated as verified.</p> : <p className="text-xs text-muted-foreground">Run the audit to see evidence, exact gaps, and prioritized next actions.</p>}
      </section>

      <details className="rounded-xl border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm">
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {SECTIONS.map(([name, label]) => (
              <span key={name} className="flex items-center gap-1.5"><span className={`size-2 rounded-full ${dot(diagnostics.data?.sections[name]?.status)}`} />{label}</span>
            ))}
          </span>
          <span className="text-xs text-muted-foreground">{diagnostics.isFetching ? "Checking…" : "Details"}</span>
        </summary>
        <div className="space-y-3 border-t border-border p-3 text-sm">
          {SECTIONS.map(([name, label]) => {
            const section = diagnostics.data?.sections[name];
            const reason = section && section.status === "unavailable" ? section.reason : undefined;
            return (
              <div key={name}>
                <p className="font-medium">{label} · {section?.status ?? "not checked"}</p>
                <p className="text-xs text-muted-foreground">{section?.note ?? "Run diagnostics to collect evidence."}</p>
                {reason ? <p className="break-words text-xs text-destructive">Reason: {reason}</p> : null}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">Snapshot: {diagnostics.data?.checkedAt ?? "not collected"}. “Checked” means the query ran—not that the subsystem is healthy.</p>
          {diagnostics.error ? <p role="alert" className="text-xs text-destructive">Diagnostics unavailable. No healthy verdict can be inferred.</p> : null}
          {diagnostics.data ? <details className="rounded-lg border border-border p-2"><summary className="cursor-pointer text-xs">Inspect bounded diagnostic evidence</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(diagnostics.data, null, 2)}</pre></details> : null}
        </div>
      </details>

      <details className="rounded-xl border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium"><Megaphone className="size-4" aria-hidden />Prospector · research and draft, you approve every send</summary>
        <div className="space-y-3 border-t border-border p-3">
          <p className="text-xs text-muted-foreground">One business per line: name | website | city | email. Website and email are optional; up to 5 at a time. Jarvis reads each public homepage, writes a short honest email from what it actually sees, adds your opt-out line and mailing address, then stops. You review and send. Email only: cold texts and auto-dialed calls need prior consent.</p>
          <Textarea value={prospectText} rows={4} onChange={(event) => setProspectText(event.target.value)} placeholder="Triangle Comfort HVAC | triangle-comfort.com | Raleigh | owner@triangle-comfort.com" />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={prospecting.isPending || prospectLines.length === 0} onClick={() => prospecting.mutate(prospectLines)}>{prospecting.isPending ? "Reading sites and drafting…" : `Draft outreach${prospectLines.length ? ` (${prospectLines.length})` : ""}`}</Button>
            {dnc.length > 0 ? <span className="text-xs text-muted-foreground">{dnc.length} on do-not-contact (this device) <button type="button" className="underline" onClick={() => saveDnc([])}>clear</button></span> : null}
          </div>
          {drafts.length > 0 && !addressConfigured ? <p role="alert" className="text-xs text-destructive">Your mailing address isn't configured. Set REVORA_MAILING_ADDRESS (a real street address or PO box) in your server environment. Until then every draft carries a placeholder and the mail button stays off.</p> : null}
          {drafts.map((draft, index) => {
            const body = edits[index] ?? draft.body;
            const blocked = body.includes(ADDRESS_PLACEHOLDER);
            return (
              <article key={`${draft.name}-${index}`} className="space-y-2 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{draft.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{draft.website ?? "No website"}{draft.email ? ` · ${draft.email}` : " · no email yet"}</p>
                </div>
                {draft.skipped ? <p className="text-xs text-destructive">{draft.skipped}</p> : (
                  <>
                    <p className="text-xs text-muted-foreground">{draft.notes.join(" · ")}</p>
                    <p className="break-words text-sm font-medium">Subject: {draft.subject}</p>
                    <Textarea rows={9} value={body} onChange={(event) => setEdits((current) => ({ ...current, [index]: event.target.value }))} />
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => { void copy(`Subject: ${draft.subject}\n\n${body}`); }}><Copy className="mr-1 size-3.5" />Copy</Button>
                      {draft.email && !blocked ? <a className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted" href={`mailto:${draft.email}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(body)}`}>Open in mail app</a> : null}
                      <Button type="button" size="sm" variant="ghost" onClick={() => suppressDraft(draft)}><Ban className="mr-1 size-3.5" />Do not contact</Button>
                    </div>
                    {blocked ? <p className="text-xs text-destructive">Add your mailing address to the footer before sending.</p> : null}
                  </>
                )}
              </article>
            );
          })}
        </div>
      </details>

      <ProspectDemoBuilder />

      <div className="inline-flex w-fit rounded-full border border-border p-0.5" role="radiogroup" aria-label="Response style">
        {MODES.map(([value, label]) => (
          <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => chooseMode(value)} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${mode === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
        ))}
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Quick commands">
        {COMMANDS.map(([label, prompt]) => <Button key={label} type="button" variant="outline" size="sm" className="shrink-0 rounded-full" disabled={busy} onClick={() => submit(prompt)}>{label}</Button>)}
      </div>

      <div className="relative">
        <div ref={scroller} onScroll={onScroll} role="log" aria-label="Jarvis conversation" aria-live="polite" className="min-h-[40dvh] max-h-[60dvh] space-y-5 overflow-y-auto rounded-2xl border border-border bg-card p-3 sm:p-4">
          {history.isLoading ? <p className="text-sm text-muted-foreground">Loading your conversation…</p> : null}
          {history.error ? <p role="alert" className="text-sm text-destructive">Your conversation could not be loaded.</p> : null}
          {empty ? (
            <div className="space-y-4 py-4">
              <div className="space-y-1 text-center"><p className="text-lg font-medium">What are we working on?</p><p className="text-sm text-muted-foreground">Briefings, strategy, copy, Lovable prompts, code, second opinions.</p></div>
              <div className="grid gap-2 sm:grid-cols-2">
                {STARTERS.map(([label, hint, prompt]) => (
                  <button key={label} type="button" disabled={busy} onClick={() => submit(prompt)} className="rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted disabled:opacity-50"><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-muted-foreground">{hint}</span></button>
                ))}
              </div>
            </div>
          ) : null}
          {messages.map((message) => message.role === "user" ? (
            <article key={message.id} className="flex min-w-0 flex-col items-end gap-1">
              <div className="max-w-[88%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-primary-foreground"><p className="whitespace-pre-wrap break-words text-sm">{message.content}</p></div>
              <span className="text-[11px] text-muted-foreground">{clock(message.created_at)}</span>
            </article>
          ) : (
            <article key={message.id} className={`flex min-w-0 gap-2 ${regen.isPending && message.id === lastAssistantId ? "opacity-50" : ""}`}>
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"><Bot className="size-4" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm"><MessageResponse>{message.content}</MessageResponse></div>
                <div className="mt-1 flex flex-wrap items-center gap-1 text-muted-foreground">
                  <span className="mr-1 text-[11px]">{clock(message.created_at)}</span>
                  <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => { void copy(message.content); }}><Copy className="size-3.5" />Copy</Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => speak(message.content)}><Volume2 className="size-3.5" />Listen</Button>
                  {message.id === lastAssistantId ? <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={busy} onClick={() => regen.mutate()}><RotateCcw className="size-3.5" />Regenerate</Button> : null}
                </div>
              </div>
            </article>
          ))}
          {pending ? (
            <article className="flex min-w-0 flex-col items-end gap-1"><div className="max-w-[88%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-primary-foreground"><p className="whitespace-pre-wrap break-words text-sm">{pending}</p></div></article>
          ) : null}
          {busy ? <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Bot className="size-4 animate-pulse" aria-hidden /><span>{stage}… {elapsed}s</span></div> : null}
          {followups.length > 0 && !busy ? <div className="flex flex-wrap gap-2 pl-9">{followups.map((item) => <Button key={item} type="button" variant="secondary" size="sm" className="h-auto whitespace-normal rounded-full py-1.5 text-left" onClick={() => submit(item)}>{item}</Button>)}</div> : null}
          <div ref={end} />
        </div>
        {!atBottom ? <Button type="button" variant="secondary" size="icon" aria-label="Jump to latest" className="absolute bottom-3 right-3 rounded-full shadow" onClick={() => { setAtBottom(true); end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }}><ArrowDown className="size-4" /></Button> : null}
      </div>

      <form className="sticky bottom-0 z-10 -mx-1 bg-background/95 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2">
          <label htmlFor="jarvis-message" className="sr-only">Message Jarvis</label>
          <Textarea
            id="jarvis-message" ref={input} value={text} maxLength={MAX_LENGTH} rows={1}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }}
            className="max-h-40 min-h-[44px] min-w-0 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            placeholder="Ask anything: errors, strategy, copy, prompts, code…"
          />
          <Button type="button" variant="ghost" size="icon" aria-label={listening ? "Stop microphone" : "Dictate"} aria-pressed={listening} disabled={busy} onClick={toggleMic} className={listening ? "animate-pulse text-destructive" : ""}>{listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}</Button>
          <Button type="submit" size="icon" aria-label="Send" disabled={!text.trim() || busy}><Send className="size-4" /></Button>
        </div>
        <p className="mt-1 text-right text-[11px] text-muted-foreground">{text.length > 3000 ? `${text.length}/${MAX_LENGTH} · ` : ""}Enter to send · Shift+Enter for a new line</p>
      </form>
    </div>
  );
}
