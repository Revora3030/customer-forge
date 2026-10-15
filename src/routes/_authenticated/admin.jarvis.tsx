import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, Ban, Bot, Copy, Download, ExternalLink, Globe, MapPin, Megaphone, Mic, MicOff, RefreshCw, RotateCcw, Search, Send, Sparkles, Trash2, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MessageResponse } from "@/components/ai-elements/message";
import { clearJarvisHistory, getJarvisHistory, getJarvisDiagnostics, regenerateJarvisReply, sendJarvisMessage } from "@/lib/jarvis.functions";
import { draftProspectOutreach, type ProspectDraft } from "@/lib/jarvis-prospecting.functions";
import { generateAcquisitionSitePreview, listAcquisitionInterestQueue, listAcquisitionPipeline, saveAcquisitionProspect, searchAcquisitionCandidates, updateAcquisitionInterestStatus } from "@/lib/jarvis-acquisition-studio.functions";
import type { AcquisitionCandidate } from "@/lib/jarvis-acquisition-studio";

type Recognition = {
  lang: string; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start: () => void; stop: () => void;
};
type RecognitionConstructor = new () => Recognition;
type Mode = "brief" | "balanced" | "deep";
type ProspectLine = { name: string; website: string; city: string; email: string };
type DiscoveryInput = { category: string; city: string; state: string };
type SaveCandidateInput = { candidate: AcquisitionCandidate; city: string; state: string };

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
const OFFER = "Review my offer ($350 setup, first month free, then $100/month, 3-day trial) for conversion weaknesses and suggest tests sized for low traffic. Do not invent numbers.";
const OUTREACH = "Draft three short cold emails for Raleigh-area local service businesses offering the Revora website and CRM. No phone numbers, no invented results or reviews.";
const RULES = "Legal and honest only: cold email needs an honest sender, a physical mailing address, and an opt-out; no cold texts or auto-dialed calls without prior consent; no purchased lists, fake reviews, or deceptive subject lines.";
const AUTOPILOT = `Build my customer-acquisition autopilot plan for this week. Split it into what Jarvis can draft for me, what needs my approval before anything goes out, and what I must do myself. Include the daily routine, the numbers to track (prospects found, emails approved, replies, trials started, paid customers), and a realistic expectation for low volume. ${RULES}`;
const PROSPECT_IDEAS = `List ten types of Raleigh and Chapel Hill local service businesses most likely to buy a $350 website with built-in quotes, booking and follow-up, and how to find each type legally (Google Maps, chamber directories, Yelp). Do not suggest scraping that breaks a site's terms. ${RULES}`;
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
  ["Offer review", "Find conversion leaks in the $350 offer", OFFER],
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
  const send = useServerFn(sendJarvisMessage);
  const redo = useServerFn(regenerateJarvisReply);
  const clear = useServerFn(clearJarvisHistory);
  const draftFn = useServerFn(draftProspectOutreach);
  const discoverFn = useServerFn(searchAcquisitionCandidates);
  const saveCandidateFn = useServerFn(saveAcquisitionProspect);
  const pipelineFn = useServerFn(listAcquisitionPipeline);
  const generateSiteFn = useServerFn(generateAcquisitionSitePreview);
  const interestQueueFn = useServerFn(listAcquisitionInterestQueue);
  const reviewInterestFn = useServerFn(updateAcquisitionInterestStatus);
  const history = useQuery({ queryKey: ["jarvis", "history"], queryFn: () => load() });
  const diagnostics = useQuery({ queryKey: ["jarvis", "diagnostics"], queryFn: () => inspect(), staleTime: 60_000, retry: false });
  const acquisitionPipeline = useQuery({ queryKey: ["jarvis", "acquisition-pipeline"], queryFn: () => pipelineFn(), staleTime: 30_000, retry: false });
  const acquisitionInterestQueue = useQuery({ queryKey: ["jarvis", "acquisition-interest-queue"], queryFn: () => interestQueueFn(), staleTime: 30_000, retry: false });
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("balanced");
  const [pending, setPending] = useState<string | null>(null);
  const [followups, setFollowups] = useState<string[]>([]);
  const [voice, setVoice] = useState(false);
  const [listening, setListening] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [prospectText, setProspectText] = useState("");
  const [discoveryCategory, setDiscoveryCategory] = useState("pressure washing");
  const [discoveryCity, setDiscoveryCity] = useState("Raleigh");
  const [discoveryState, setDiscoveryState] = useState("North Carolina");
  const [discoveryResults, setDiscoveryResults] = useState<AcquisitionCandidate[]>([]);
  const [discoveryQuery, setDiscoveryQuery] = useState<string | null>(null);
  const [generatedAcquisitionPreview, setGeneratedAcquisitionPreview] = useState<{ title: string; previewPath: string; expiresAt: string; notice: string } | null>(null);
  const [drafts, setDrafts] = useState<ProspectDraft[]>([]);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [dnc, setDnc] = useState<string[]>([]);
  const [addressConfigured, setAddressConfigured] = useState(true);
  const recognition = useRef<Recognition | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const speak = (content: string) => {
    if (!("speechSynthesis" in window)) { toast.error("Speech is unavailable in this browser."); return; }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(content.replace(/[#*_`>|]/g, " ").slice(0, 1500)));
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
  const acquisitionSearch = useMutation({
    mutationFn: (input: DiscoveryInput) => discoverFn({ data: input }),
    onSuccess: (result) => { setDiscoveryResults(result.candidates); setDiscoveryQuery(result.query); if (!result.candidates.length) toast.message("No suitable listings returned. Try a nearby city or a different category."); },
    onError: (error: Error) => toast.error(error.message || "Business discovery failed."),
  });
  const acquisitionSave = useMutation({
    mutationFn: ({ candidate, city, state }: SaveCandidateInput) => saveCandidateFn({ data: { placeId: candidate.placeId, category: candidate.category, city, state } }),
    onSuccess: async (result) => { toast.success(result.alreadySaved ? "Listing refreshed in the acquisition pipeline." : "Business saved to the acquisition pipeline."); await qc.invalidateQueries({ queryKey: ["jarvis", "acquisition-pipeline"] }); },
    onError: (error: Error) => toast.error(error.message || "Could not save this business."),
  });
  const acquisitionGenerate = useMutation({
    mutationFn: (prospectId: string) => generateSiteFn({ data: { prospectId, confirmation: "GENERATE SITE PREVIEW" } }),
    onSuccess: async (result) => { setGeneratedAcquisitionPreview({ title: result.title, previewPath: result.previewPath, expiresAt: result.expiresAt, notice: result.notice }); toast.success("The concept passed safety validation and a private preview was created."); await qc.invalidateQueries({ queryKey: ["jarvis", "acquisition-pipeline"] }); },
    onError: (error: Error) => toast.error(error.message || "Site concept could not be generated."),
  });
  const acquisitionReviewInterest = useMutation({
    mutationFn: (input: { interestId: string; status: "reviewed" | "dismissed" }) => reviewInterestFn({ data: input }),
    onSuccess: async (result) => { toast.success(result.status === "reviewed" ? "Marked for human follow-up." : "Request dismissed."); await Promise.all([qc.invalidateQueries({ queryKey: ["jarvis", "acquisition-interest-queue"] }), qc.invalidateQueries({ queryKey: ["jarvis", "acquisition-pipeline"] })]); },
    onError: (error: Error) => toast.error(error.message || "Could not update the interest request."),
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
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
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
          <Button type="button" variant="ghost" size="icon" aria-label={voice ? "Mute replies" : "Speak replies"} aria-pressed={voice} title={voice ? "Mute replies" : "Speak replies"} onClick={() => { setVoice(!voice); window.speechSynthesis?.cancel(); }}>{voice ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}</Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Export chat" title="Export chat as Markdown" onClick={exportChat}><Download className="size-4" /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Clear my chat" title="Clear my chat" disabled={clearing.isPending || busy} onClick={() => { if (window.confirm("Clear your Jarvis history?")) clearing.mutate(); }}><Trash2 className="size-4" /></Button>
        </div>
      </header>

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

      <section aria-label="Jarvis acquisition studio" className="space-y-4 rounded-xl border border-border bg-card p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2"><Sparkles className="size-5 text-primary" aria-hidden /><h2 className="text-base font-semibold">Acquisition studio</h2></div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Discover local businesses, save listing identifiers, build real AI-authored website concepts, run structural/factual safety checks, and share a private preview. No automated outreach, charges, or production publishing.</p>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={acquisitionPipeline.isFetching} onClick={() => { void acquisitionPipeline.refetch(); }}><RefreshCw className={"mr-2 size-3.5 " + (acquisitionPipeline.isFetching ? "animate-spin" : "")} />Refresh pipeline</Button>
        </div>

        <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="acquisition-category">Business type</Label><Input id="acquisition-category" value={discoveryCategory} maxLength={90} onChange={(event) => setDiscoveryCategory(event.target.value)} placeholder="Pressure washing" /></div>
          <div className="space-y-1.5"><Label htmlFor="acquisition-city">City</Label><Input id="acquisition-city" value={discoveryCity} maxLength={80} onChange={(event) => setDiscoveryCity(event.target.value)} placeholder="Raleigh" /></div>
          <div className="space-y-1.5"><Label htmlFor="acquisition-state">State or region</Label><Input id="acquisition-state" value={discoveryState} maxLength={80} onChange={(event) => setDiscoveryState(event.target.value)} placeholder="North Carolina" /></div>
          <div className="sm:col-span-3 flex flex-wrap items-center gap-2">
            <Button type="button" disabled={acquisitionSearch.isPending} onClick={() => { setGeneratedAcquisitionPreview(null); acquisitionSearch.mutate({ category: discoveryCategory, city: discoveryCity, state: discoveryState }); }}>
              <Search className="mr-2 size-4" aria-hidden />{acquisitionSearch.isPending ? "Searching listings…" : "Find businesses"}
            </Button>
            <p className="text-xs text-muted-foreground">Up to 5 results per search. Google Maps connector access and its API quota are required.</p>
          </div>
        </div>

        {discoveryQuery ? <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Results for “{discoveryQuery}”</p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-label="Google Maps attribution">
              <img src="https://maps.gstatic.com/mapfiles/api-3/images/google4.png" alt="Google" width={42} height={14} className="h-3.5 w-auto" />
              <span>Maps results · data may change</span>
            </div>
          </div>
          <p className="rounded-md border border-border bg-muted/30 p-2 text-xs leading-relaxed text-muted-foreground">“Website not listed” means Google did not return a website field. It does not prove the business has no website. Verify before making that claim. Listing data expires and must be refreshed.</p>
          {discoveryResults.length ? discoveryResults.map((candidate) => (
            <article key={candidate.placeId} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">{candidate.name}</h3>
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground"><MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />{candidate.address || candidate.city}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{candidate.category} · Score {candidate.score}/100 · {candidate.phone || "No public phone listed"}</p>
                </div>
                <span className="rounded-full border border-border px-2.5 py-1 text-[11px]">{candidate.website ? "Website listed" : "Website not listed"}</span>
              </div>
              {candidate.website ? <a className="inline-flex items-center gap-1 text-xs underline" href={candidate.website} target="_blank" rel="noopener noreferrer"><Globe className="size-3.5" aria-hidden />Inspect listed website <ExternalLink className="size-3" aria-hidden /></a> : <p className="text-xs text-muted-foreground">Potential new-site opportunity · status needs verification</p>}
              <details className="rounded-md bg-muted/20 px-2 py-1.5">
                <summary className="cursor-pointer text-xs">Why this was scored</summary>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">{candidate.scoreReasons.map((reason, index) => <li key={reason + index}>{reason}</li>)}</ul>
              </details>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={acquisitionSave.isPending} onClick={() => acquisitionSave.mutate({ candidate, city: discoveryCity, state: discoveryState })}>{acquisitionSave.isPending ? "Saving…" : "Save opportunity"}</Button>
                {candidate.mapsUri ? <a className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs hover:bg-muted" href={candidate.mapsUri} target="_blank" rel="noopener noreferrer">Open listing <ExternalLink className="size-3" aria-hidden /></a> : null}
              </div>
            </article>
          )) : <p className="text-xs text-muted-foreground">No candidates with usable Place IDs were returned. Try another category or nearby city.</p>}
        </div> : null}

        {acquisitionPipeline.error ? <p role="alert" className="text-xs text-destructive">Pipeline unavailable. Verify that the Jarvis acquisition migration has been applied.</p> : null}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Saved opportunities</h3>
            <span className="text-xs text-muted-foreground">{acquisitionPipeline.data?.prospects.length ?? 0} tracked</span>
          </div>
          {(acquisitionPipeline.data?.prospects ?? []).length ? (acquisitionPipeline.data?.prospects ?? []).map((prospect) => (
            <article key={prospect.id} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium">{prospect.businessName || "Listing expired — refresh from search"}</h4>
                  <p className="mt-1 text-xs text-muted-foreground">{[prospect.category, prospect.city].filter(Boolean).join(" · ") || "Source data removed until refreshed"}</p>
                </div>
                <span className="rounded-full border border-border px-2.5 py-1 text-[11px]">{prospect.stage.replaceAll("_", " ")}</span>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground"><span>Opportunity score: {prospect.score}/100</span><span>Preview requests: {prospect.interestCount}</span>{prospect.websiteStatus === "needs_refresh" ? <span>Listing refresh required</span> : null}{prospect.activePreviewExpiresAt ? <span>Private preview expires {new Date(prospect.activePreviewExpiresAt).toLocaleDateString()}</span> : null}</div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={acquisitionGenerate.isPending || prospect.websiteStatus === "needs_refresh" || !prospect.businessName} onClick={() => { if (window.confirm("Generate a real AI-authored draft website concept for " + prospect.businessName + "? This can use the configured free AI provider, creates a private expiring preview, and does not publish, contact, or charge anyone.")) acquisitionGenerate.mutate(prospect.id); }}>{acquisitionGenerate.isPending ? "Building concept…" : "Build website concept"}</Button>
                {prospect.website ? <a className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs hover:bg-muted" href={prospect.website} target="_blank" rel="noopener noreferrer">Inspect current site <ExternalLink className="size-3" aria-hidden /></a> : null}
              </div>
            </article>
          )) : <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">{acquisitionPipeline.isLoading ? "Loading saved opportunities…" : "No opportunities saved yet. Search a business category and city to begin."}</p>}
        </div>

        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-sm font-semibold">Preview interest queue</h3><p className="mt-0.5 text-xs text-muted-foreground">Owner-initiated requests only. Contact is manual; nothing is emailed automatically.</p></div>
            <Button type="button" size="sm" variant="outline" disabled={acquisitionInterestQueue.isFetching} onClick={() => { void acquisitionInterestQueue.refetch(); }}><RefreshCw className={"mr-2 size-3.5 " + (acquisitionInterestQueue.isFetching ? "animate-spin" : "")} />Refresh requests</Button>
          </div>
          {acquisitionInterestQueue.error ? <p role="alert" className="text-xs text-destructive">Interest queue unavailable. Check the database migration and service-role grants.</p> : null}
          {(acquisitionInterestQueue.data?.requests ?? []).length ? (acquisitionInterestQueue.data?.requests ?? []).map((request) => (
            <article key={request.id} className="space-y-2 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><h4 className="text-sm font-medium">{request.contactName} · {request.businessName}</h4><p className="mt-1 text-xs text-muted-foreground">{request.category}{request.city ? " · " + request.city : ""} · {request.previewTitle}</p></div>
                <span className="rounded-full border border-border px-2 py-1 text-[11px]">{request.status}</span>
              </div>
              <p className="text-xs">{request.email}{request.phone ? " · " + request.phone : ""}</p>
              {request.notes ? <p className="rounded-md bg-muted/30 p-2 text-xs leading-relaxed">{request.notes}</p> : null}
              <p className="text-[11px] text-muted-foreground">Received {new Date(request.createdAt).toLocaleString()}</p>
              <div className="flex flex-wrap gap-2">
                <a className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90" href={"mailto:" + encodeURIComponent(request.email) + "?subject=" + encodeURIComponent("Your Revora website concept") + "&body=" + encodeURIComponent("Hi " + request.contactName + ",\n\nThanks for requesting next steps on your website concept. You can review Revora Growth Systems and continue setup here: https://revoragrowthsystems.com/get-started\n\nWe will confirm your actual business details before launching your site.")}>Open reply draft</a>
                <Button size="sm" variant="outline" disabled={acquisitionReviewInterest.isPending || request.status === "reviewed"} onClick={() => acquisitionReviewInterest.mutate({ interestId: request.id, status: "reviewed" })}>Mark reviewed</Button>
                <Button size="sm" variant="ghost" disabled={acquisitionReviewInterest.isPending} onClick={() => { if (window.confirm("Dismiss this request without contacting the owner?")) acquisitionReviewInterest.mutate({ interestId: request.id, status: "dismissed" }); }}>Dismiss</Button>
                <Button size="sm" variant="ghost" onClick={() => { void copy("Business: " + request.businessName + "\nContact: " + request.contactName + "\nEmail: " + request.email + "\nPhone: " + (request.phone ?? "") + "\nRequest: " + request.notes); }}>Copy details</Button>
              </div>
            </article>
          )) : <p className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">{acquisitionInterestQueue.isLoading ? "Loading interest requests…" : "No new or reviewed preview requests yet."}</p>}
        </div>

        {generatedAcquisitionPreview ? <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="font-medium text-sm">Private website concept created: {generatedAcquisitionPreview.title}</p>
          <p className="text-xs text-muted-foreground">{generatedAcquisitionPreview.notice}</p>
          <div className="flex flex-wrap gap-2">
            <a className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90" href={generatedAcquisitionPreview.previewPath} target="_blank" rel="noopener noreferrer">Open preview <ExternalLink className="size-4" aria-hidden /></a>
            <Button size="sm" variant="outline" onClick={() => { void copy(window.location.origin + generatedAcquisitionPreview.previewPath); }}>Copy private preview link</Button>
          </div>
          <p className="text-xs text-muted-foreground">Link expires {new Date(generatedAcquisitionPreview.expiresAt).toLocaleString()}. It is a concept only; production publishing and billing are separate approvals.</p>
        </div> : null}
      </section>

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
