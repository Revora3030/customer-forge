import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StickToBottomContext } from "use-stick-to-bottom";
import { RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { TypingDots } from "@/components/ai-elements/shimmer";
import { useJarvisVoice } from "@/components/app/use-jarvis-voice";
import { useProspectDemoPump } from "@/lib/prospect-demo-pump.hooks";
import { JarvisHeader, type ChecksSummary } from "@/components/app/jarvis/JarvisHeader";
import { JarvisComposer, type JarvisMode } from "@/components/app/jarvis/JarvisComposer";
import { AssistantMessage, UserMessage, type JarvisRow } from "@/components/app/jarvis/JarvisMessage";
import { RunStepsSheet } from "@/components/app/jarvis/RunStepsSheet";
import { LiveRunSteps } from "@/components/app/jarvis/LiveRunSteps";
import { ConversationsSheet } from "@/components/app/jarvis/ConversationsSheet";
import { OperationsPanel, DIAGNOSTIC_SECTIONS, type ProspectorState } from "@/components/app/jarvis/OperationsPanel";
import { CommandPalette } from "@/components/app/jarvis/CommandPalette";
import { LiveSurface, type VoiceState } from "@/components/app/jarvis/LiveSurface";
import { useJarvisHeight } from "@/components/app/jarvis/use-jarvis-height";
import { readApprovals, rememberApproval, type Approvals } from "@/components/app/jarvis/jarvis-approvals";
import { DemoBuildCard } from "@/components/app/jarvis/DemoBuildCard";
import { findMapsLink, readDemoCards, readDemoSendProposal, rememberDemoCard, type DemoCardRef, type DemoChannel } from "@/components/app/jarvis/demo-build";
import "@/components/app/jarvis/jarvis.css";
import { askClaudeToFixPullRequestFn, openJarvisPullRequestFn, recoverStalledBuildsFn, sendClaudeCodeRequestFn, clearJarvisHistory, getJarvisHistory, getJarvisDiagnostics, getJarvisAcquisitionReadiness, getJarvisDiagnosticTools, runJarvisDiagnosticTool, regenerateJarvisReply, sendJarvisMessage, forgetJarvisMemoryFn, saveJarvisRoutineFn, deleteJarvisRoutineFn, JARVIS_HISTORY_PAGE } from "@/lib/jarvis.functions";
import { draftProspectOutreach, type ProspectDraft } from "@/lib/jarvis-prospecting.functions";
import { formatRevoraOffer } from "@/lib/jarvis-acquisition-policy";
import { jarvisVoiceLinks, synthesizeJarvisVoice } from "@/lib/jarvis-voice.functions";
import { speakableText, type WriteProposal } from "@/lib/jarvis-actions";
import { prospectFromImageFn, startProspectDemoBuild } from "@/lib/jarvis-demo-site.functions";
import { pictureDataUrl } from "@/lib/picture-data-url";
import { isAutopilotProposal, useApproveAutopilotProposal } from "@/components/app/jarvis/autopilot-proposal";
import { saveInstagramDraftFn } from "@/lib/instagram.functions";
import { approvePerplexityResearch } from "@/lib/integrations/perplexity-agent.functions";
import { readResearchResults, rememberResearchResult, type ResearchResults } from "@/components/app/jarvis/research-results";
import { ResearchResultCard } from "@/components/app/jarvis/ResearchResultCard";

type RecognitionResult = ArrayLike<{ transcript: string }> & { isFinal?: boolean };
type Recognition = {
  lang: string; interimResults: boolean;
  onresult: ((event: { resultIndex?: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start: () => void; stop: () => void;
};
type RecognitionConstructor = new () => Recognition;
type Mode = JarvisMode;
type ProspectLine = { name: string; website: string; city: string; email: string };

export const Route = createFileRoute("/_authenticated/admin/jarvis")({
  head: () => ({ meta: [{ title: "Jarvis mission control — Revora" },
      { name: "description", content: "Manage Jarvis conversations, approvals and operations." },
      { property: "og:title", content: "Jarvis mission control — Revora" },
      { property: "og:description", content: "Manage Jarvis conversations, approvals and operations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: Jarvis,
});

const MAX_LENGTH = 4000;
const DRAFT_KEY = "jarvis:draft";
const MODE_KEY = "jarvis:mode";
const DNC_KEY = "jarvis:dnc";
const ADDRESS_PLACEHOLDER = "[ADD YOUR PHYSICAL MAILING ADDRESS";

const BRIEFING = "Give me a daily briefing: the top three priorities from the diagnostics, what looks fine, what is at risk, and the single most valuable action today. Label anything not checked.";
const AUDIT = "Audit my homepage HTTP and metadata checks and give me the exact fixes in priority order. Say what is not proven.";
const OFFER = `Review my offer (${formatRevoraOffer()}) for conversion weaknesses and suggest tests sized for low traffic. Do not invent numbers.`;
const OUTREACH = "Draft three short cold emails for Raleigh-area local service businesses offering the Revora website and CRM. No phone numbers, no invented results or reviews.";
const RULES = "Legal and honest only: cold email needs an honest sender, a physical mailing address, and an opt-out; no cold texts or auto-dialed calls without prior consent; no purchased lists, fake reviews, or deceptive subject lines.";
const AUTOPILOT = `Build my customer-acquisition autopilot plan for this week. Split it into what Jarvis can draft for me, what needs my approval before anything goes out, and what I must do myself. Include the daily routine, the numbers to track (prospects found, emails approved, replies, trials started, paid customers), and a realistic expectation for low volume. ${RULES}`;
const PROSPECT_IDEAS = `List ten types of Raleigh and Chapel Hill local service businesses most likely to buy a website with this offer: ${formatRevoraOffer()} with built-in quotes, booking and follow-up, and how to find each type legally (Google Maps, chamber directories, Yelp). Do not suggest scraping that breaks a site's terms. ${RULES}`;
const FOLLOW_UP = `Design a three-touch email follow-up sequence for prospects who did not reply, spaced over two weeks, each under 80 words, each with an easy opt-out. ${RULES}`;

const FIX_TOP_ERROR = "Run the platform error and builder health checks, find the most damaging real problem, read the code responsible, and propose a focused pull request that fixes the root cause. Explain the fix in plain language.";
const UPGRADE = "Read the code behind the builder and Jarvis, pick the single highest-impact upgrade for customers, and propose it as a focused pull request. Say what you'd do next after it.";

const COMMANDS = [
  ["Fix top error", FIX_TOP_ERROR],
  ["Propose an upgrade", UPGRADE],
  ["Fix stuck builds", "Run the builder health check. If any website builds are stuck or failing repeatedly, explain why from the evidence and propose builds.recover."],
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

const DEMO_FROM_MAPS = "I want a demo site for a business on Google Maps. Ask me for the Maps link (or its name and city) if I haven't pasted it, look it up with prospect.lookup, tell me what the listing shows, then propose demo.build with only those facts.";

const STARTERS = [
  ["Demo from Google Maps", "Paste a Maps link, Jarvis drafts the site", DEMO_FROM_MAPS],
  ["Fix top error", "Find it, read the code, open a fix PR", FIX_TOP_ERROR],
  ["Daily briefing", "What matters today, ranked by impact", BRIEFING],
  ["Autopilot plan", "This week's customer-acquisition routine", AUTOPILOT],
  ["Propose an upgrade", "The highest-impact improvement, as a PR", UPGRADE],
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

/** Older rows first, then the latest page; a row present in both is kept once. */
const mergeRows = (older: JarvisRow[], newer: JarvisRow[]) => {
  const ids = new Set(newer.map((row) => row.id));
  return [...older.filter((row) => !ids.has(row.id)), ...newer];
};

const dayKey = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toDateString();
};
const dayLabel = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", ...(date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }) });
};

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
  const voiceLinks = useServerFn(jarvisVoiceLinks);
  const draftFn = useServerFn(draftProspectOutreach);
  const buildDemo = useServerFn(startProspectDemoBuild);
  const openPr = useServerFn(openJarvisPullRequestFn);
  const sendToClaudeCode = useServerFn(sendClaudeCodeRequestFn);
  const askClaudeFix = useServerFn(askClaudeToFixPullRequestFn);
  const recoverBuilds = useServerFn(recoverStalledBuildsFn);
  const approveAutopilot = useApproveAutopilotProposal();
  const readPicture = useServerFn(prospectFromImageFn);
  const rootRef = useRef<HTMLDivElement>(null);
  useJarvisHeight(rootRef);
  // Active demo builds keep moving while this page is open, sheet or not.
  useProspectDemoPump(true);
  const [readingPicture, setReadingPicture] = useState(false);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);
  const [openedPrs, setOpenedPrs] = useState<Record<string, string>>({});
  // null = continue the most recent conversation; set once a conversation is known.
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showConversations, setShowConversations] = useState(false);
  const historyKey = ["jarvis", "history", conversationId] as const;
  const history = useQuery({ queryKey: historyKey, queryFn: () => load({ data: { conversationId } }) });
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
  const [liveRun, setLiveRun] = useState<string | null>(null);
  const [followups, setFollowups] = useState<string[]>([]);
  const [voice, setVoice] = useState(false);
  const [live, setLive] = useState(false);
  const liveRef = useRef(false);
  // Set when the owner stops playback (Stop, mute, Tap to talk) so a finishing reply doesn't restart listening twice.
  const userStoppedRef = useRef(false);
  const [showTools, setShowTools] = useState(false);
  const [stepsRun, setStepsRun] = useState<string | null>(null);
  // Wide screens show the operations panel beside the chat; phones use a sheet.
  // null until measured, so the first paint never swaps one for the other.
  const [wide, setWide] = useState<boolean | null>(null);
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1280px)");
    const touch = window.matchMedia("(pointer: coarse)");
    const update = () => { setWide(query.matches); setCoarse(touch.matches); };
    update();
    query.addEventListener?.("change", update);
    touch.addEventListener?.("change", update);
    return () => { query.removeEventListener?.("change", update); touch.removeEventListener?.("change", update); };
  }, []);
  const [approved, setApproved] = useState<Record<string, "building" | "done">>({});
  const [researchResults, setResearchResults] = useState<ResearchResults>(() => readResearchResults());
  const [remembered, setRemembered] = useState<Approvals>({});
  // Live demo build cards: under the chat proposal that started them (kept on this device),
  // or at the end of the chat for builds and previews opened from Operations.
  const [demoCards, setDemoCards] = useState<Record<string, DemoCardRef>>({});
  const [sendCards, setSendCards] = useState<Record<string, { card: DemoCardRef; channel: DemoChannel; to: string; nonce: number }>>({});
  const [liveCards, setLiveCards] = useState<DemoCardRef[]>([]);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [prospectText, setProspectText] = useState("");
  const [drafts, setDrafts] = useState<ProspectDraft[]>([]);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [dnc, setDnc] = useState<string[]>([]);
  const [addressConfigured, setAddressConfigured] = useState(true);
  const [older, setOlder] = useState<JarvisRow[]>([]);
  const [moreEarlier, setMoreEarlier] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [focusDiagnostics, setFocusDiagnostics] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const conversation = useRef<StickToBottomContext>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const voiceSynth = useCallback((value: string) => synthesizeVoice({ data: { text: value } }), [synthesizeVoice]);
  const onVoiceFallback = useCallback((reason: string) => {
    toast.message("Using your browser voice because ElevenLabs was unavailable.", { description: reason });
  }, []);
  const voiceStream = useCallback(
    async (value: string) => (await voiceLinks({ data: { texts: [value] } })).urls[0]!,
    [voiceLinks],
  );
  const jarvisVoice = useJarvisVoice(voiceSynth, onVoiceFallback, voiceStream);
  const { stop: stopVoice } = jarvisVoice;

  const announce = (message: string) => {
    setAnnouncement("");
    window.setTimeout(() => setAnnouncement(message), 60);
  };
  const latestAssistantId = () => {
    const rows = qc.getQueryData<JarvisRow[]>(historyKey) ?? [];
    const last = rows[rows.length - 1];
    return last?.role === "assistant" ? last.id : null;
  };
  const speak = async (content: string, id: string | null = null) => {
    const clean = speakableText(content);
    if (!clean) { toast.error("There is no readable text to speak."); resumeLive(); return; }
    userStoppedRef.current = false;
    setSpeakingId(id);
    await jarvisVoice.speak(clean);
    // A stop already resumed Live itself; only a reply that played to the end resumes it here.
    if (liveRef.current && !userStoppedRef.current) resumeLive();
  };
  /** Stops playback now. In Live mode Jarvis goes straight back to listening. */
  const stopSpeaking = () => {
    userStoppedRef.current = true;
    stopVoice();
    resumeLive();
  };
  const finish = async (result: { reply: string; diagnostics: unknown; followups?: string[]; conversationId?: string | null }) => {
    if (result.conversationId && result.conversationId !== conversationId) {
      // Carry the loaded rows over so the chat doesn't flash empty.
      qc.setQueryData(["jarvis", "history", result.conversationId], qc.getQueryData(historyKey));
      setConversationId(result.conversationId);
    }
    void qc.invalidateQueries({ queryKey: ["jarvis", "conversations"] });
    qc.setQueryData(["jarvis", "diagnostics"], result.diagnostics);
    setFollowups(result.followups ?? []);
    await qc.invalidateQueries({ queryKey: ["jarvis", "history"] });
    announce("Jarvis replied");
    if (voice || liveRef.current) void speak(result.reply, latestAssistantId());
  };
  const mutation = useMutation({
    mutationFn: (message: string) => {
      const runId = crypto.randomUUID();
      setLiveRun(runId);
      return send({ data: { message, mode, conversationId, runId } });
    },
    onSuccess: finish,
    onError: async (error: Error, message: string) => {
      toast.error(error.message);
      // The server saves the message before answering, so it may already be in the chat.
      await qc.invalidateQueries({ queryKey: ["jarvis", "history"] }).catch(() => undefined);
      const rows = qc.getQueryData<JarvisRow[]>(historyKey) ?? [];
      const lastUser = [...rows].reverse().find((row) => row.role === "user");
      if (lastUser?.content !== message) setText((current) => current || message);
      resumeLive();
    },
    onSettled: () => { setPending(null); setLiveRun(null); },
  });
  const regen = useMutation({
    mutationFn: () => redo({ data: { mode, conversationId } }),
    onSuccess: finish,
    onError: (error: Error) => toast.error(error.message),
  });
  const clearing = useMutation({
    mutationFn: () => clear(),
    onSuccess: () => {
      setFollowups([]);
      setOlder([]);
      setMoreEarlier(true);
      setConversationId(null);
      void qc.invalidateQueries({ queryKey: ["jarvis", "conversations"] });
      return qc.invalidateQueries({ queryKey: ["jarvis", "history"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const prospecting = useMutation({
    mutationFn: (prospects: ProspectLine[]) => draftFn({ data: { prospects, suppress: dnc } }),
    onSuccess: (result) => { setDrafts(result.drafts); setEdits({}); setAddressConfigured(result.mailingAddressConfigured); },
    onError: (error: Error) => toast.error(error.message),
  });
  const busy = mutation.isPending || regen.isPending;
  const latest = useMemo(() => history.data ?? [], [history.data]);
  const messages = useMemo(() => mergeRows(older, latest), [older, latest]);
  const lastMessage = messages[messages.length - 1];
  const lastAssistantId = lastMessage?.role === "assistant" ? lastMessage.id : null;
  const empty = !history.isLoading && !history.error && messages.length === 0 && !pending;
  const canLoadEarlier = messages.length > 0 && (older.length ? moreEarlier : latest.length >= JARVIS_HISTORY_PAGE);
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
    setRemembered(readApprovals());
    setDemoCards(readDemoCards());
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
  // When new messages push the oldest rows out of the latest page, keep them with the
  // earlier pages already loaded, so "Load earlier" never leaves a gap.
  const previousLatest = useRef<JarvisRow[]>([]);
  useEffect(() => {
    const previous = previousLatest.current;
    const next = history.data ?? [];
    previousLatest.current = next;
    if (next.length < JARVIS_HISTORY_PAGE || !next[0]) return;
    const cutoff = next[0].created_at;
    const dropped = previous.filter((row) => row.created_at < cutoff);
    if (dropped.length) setOlder((current) => (current.length ? mergeRows(current, dropped) : current));
  }, [history.data]);
  useEffect(() => () => {
    if (recognition.current) {
      recognition.current.onresult = null;
      recognition.current.onend = null;
      recognition.current.onerror = null;
      recognition.current.stop();
    }
    stopVoice();
  }, [stopVoice]);

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
  /** Detaches and stops the current recognizer so it can't write into the draft afterwards. */
  const detachRecognition = () => {
    const rec = recognition.current;
    recognition.current = null;
    if (rec) {
      rec.onresult = null;
      rec.onend = null;
      rec.onerror = null;
      try { rec.stop(); } catch { /* already stopped */ }
    }
    setListening(false);
    setInterim("");
  };
  const submit = (message = text) => {
    const clean = message.trim();
    if (!clean || busy) return;
    jarvisVoice.unlock();
    detachRecognition();
    setText("");
    setFollowups([]);
    void conversation.current?.scrollToBottom();
    setPending(clean);
    mutation.mutate(clean);
  };
  // Recognition callbacks outlive the render that created them; they always submit with the latest state.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  // A picture of a business (Maps screenshot, card, flyer, sign) becomes a demo request with only the facts read from it.
  const attachPicture = async (file: File) => {
    setReadingPicture(true);
    const preview = URL.createObjectURL(file);
    setPicturePreview(preview);
    try {
      const result = await readPicture({ data: { dataUrl: await pictureDataUrl(file) } });
      const facts = [
        ["Business name", result.prefill.businessName],
        ["Trade", result.prefill.industry],
        ["City", result.prefill.city],
        ["State", result.prefill.state],
        ["Phone", result.prefill.phone],
        ["Email", result.prefill.email],
        ["Website", result.website ?? ""],
        ["Services", result.prefill.services.replace(/\n/g, ", ")],
        ["Description", result.prefill.description],
      ].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
      submit(`I added a picture of a business. ${result.note}\n${facts.join("\n")}${result.hasRealWebsite ? "\nNote: its Google listing shows a real website." : ""}\nPropose demo.build with only these facts.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't read that picture.");
    } finally {
      setReadingPicture(false);
      setPicturePreview(null);
      URL.revokeObjectURL(preview);
    }
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
    // iOS Safari only downloads from an attached link, and needs the URL alive briefly.
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const loadEarlier = async () => {
    const oldest = messages[0];
    if (!oldest || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const rows = await load({ data: { before: oldest.created_at, conversationId } });
      setOlder((current) => mergeRows(rows, current));
      setMoreEarlier(rows.length >= JARVIS_HISTORY_PAGE);
      if (!rows.length) toast.message("That's the start of your Jarvis chat.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load earlier messages.");
    } finally {
      setLoadingEarlier(false);
    }
  };
  const toggleMic = () => {
    // In Live mode the mic is the same as Tap to talk, so the hands-free loop keeps going.
    if (liveRef.current) { tapToTalk(); return; }
    if (listening) { recognition.current?.stop(); return; }
    listen(false);
  };
  /** Hands-free mode: listen, send, speak the answer, listen again. */
  const toggleLive = () => {
    const next = !liveRef.current;
    liveRef.current = next;
    setLive(next);
    if (next) { jarvisVoice.unlock(); setVoice(true); toast.message("Live mode on. Talk to Jarvis: it answers out loud, then keeps listening."); listen(true); }
    else { detachRecognition(); userStoppedRef.current = true; stopVoice(); }
  };
  /** Tap to talk: interrupt Jarvis and listen, all inside the owner's tap. */
  const tapToTalk = () => {
    userStoppedRef.current = true;
    jarvisVoice.unlock();
    listen(true);
  };
  const toggleVoice = () => {
    const next = !voice;
    setVoice(next);
    if (next) { jarvisVoice.unlock(); return; }
    // Muting stops playback now; in Live mode Jarvis goes straight back to listening.
    userStoppedRef.current = true;
    stopVoice();
    resumeLive();
  };
  function resumeLive() {
    if (liveRef.current) window.setTimeout(() => { if (liveRef.current) listen(true); }, 350);
  }
  function listen(autoSend: boolean) {
    const browser = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Ctor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Ctor) { toast.error("Voice input is unavailable; use text instead."); return; }
    // Barge-in: stop Jarvis talking in the same tap, so the mic doesn't hear Jarvis.
    stopVoice();
    detachRecognition();
    const rec = new Ctor();
    rec.lang = "en-US"; rec.interimResults = true;
    let heard = false;
    let lastInterim = "";
    const commit = (transcript: string) => {
      heard = true;
      lastInterim = "";
      setInterim("");
      if (autoSend) submitRef.current(transcript);
      else setText((prev) => (prev ? prev + " " + transcript : transcript).slice(0, MAX_LENGTH));
    };
    rec.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex ?? 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = String(result?.[0]?.transcript ?? "");
        if (result?.isFinal) finalText += transcript; else interimText += transcript;
      }
      if (finalText.trim()) commit(finalText.trim());
      else { lastInterim = interimText.trim(); setInterim(lastInterim); }
    };
    // Silence in live mode just means keep listening.
    rec.onend = () => {
      if (recognition.current === rec) recognition.current = null;
      setListening(false);
      setInterim("");
      // Some browsers end without marking the last words final; keep them.
      if (!heard && lastInterim) commit(lastInterim);
      else if (autoSend && !heard) resumeLive();
    };
    rec.onerror = () => {
      setListening(false);
      if (!autoSend) toast.error("Voice input failed. You can still type.");
    };
    recognition.current = rec;
    try { rec.start(); setListening(true); } catch { recognition.current = null; setListening(false); if (!autoSend) toast.error("Microphone could not start."); }
  }
  const forget = (key: string) => setApproved((current) => { const next = { ...current }; delete next[key]; return next; });
  const markDone = (key: string, url?: string) => {
    setApproved((current) => ({ ...current, [key]: "done" }));
    if (url) setOpenedPrs((current) => ({ ...current, [key]: url }));
    setRemembered(rememberApproval(key, { state: "done", url }));
  };
  const approveProposal = async (key: string, proposal: WriteProposal) => {
    setApproved((current) => ({ ...current, [key]: "building" }));
    if (proposal.id === "research.ask") {
      try {
        const result = await approvePerplexityResearch({ data: { question: proposal.question, preset: proposal.preset } });
        if (!result.ok) throw new Error(result.detail);
        markDone(key);
        setResearchResults(rememberResearchResult(key, {
          question: proposal.question,
          model: result.model,
          text: result.text,
          citations: result.citations,
          searchResults: result.searchResults,
          at: new Date().toISOString(),
        }));
        toast.success("Research complete — the cited answer is below.");
      } catch (error) {
        forget(key);
        toast.error(error instanceof Error ? error.message : "The research request failed.");
      }
      return;
    }
    if (proposal.id === "instagram.post") {
      try {
        await saveInstagramDraftFn({ data: proposal.draft });
        markDone(key);
        void qc.invalidateQueries({ queryKey: ["jarvis", "instagram"] });
        toast.success("Draft saved. Open Operations → Instagram to review and approve publishing.");
      } catch (error) {
        forget(key);
        toast.error(error instanceof Error ? error.message : "Couldn't save the Instagram draft.");
      }
      return;
    }
    if (proposal.id === "builds.recover") {
      try {
        const result = await recoverBuilds();
        markDone(key);
        toast.success(result.restartedWorkspaces ? `Stalled builds cleared. Restarted the worker for ${result.restartedWorkspaces} queued build${result.restartedWorkspaces === 1 ? "" : "s"}.` : "Stalled builds cleared. Nothing was waiting in the queue.");
        void qc.invalidateQueries({ queryKey: ["jarvis", "diagnostics"] });
      } catch (error) {
        forget(key);
        toast.error(error instanceof Error ? error.message : "Couldn't recover the builds.");
      }
      return;
    }
    if (isAutopilotProposal(proposal)) {
      try {
        toast.success(await approveAutopilot(proposal));
        markDone(key);
        void qc.invalidateQueries({ queryKey: ["jarvis", "prospect-autopilot"] });
      } catch (error) {
        forget(key);
        toast.error(error instanceof Error ? error.message : "Couldn't update the autopilot.");
      }
      return;
    }
    if (proposal.id === "claude.code") {
      try {
        const result = await sendToClaudeCode({ data: { request: proposal.request } });
        markDone(key, result.url);
        toast.success(`Sent to Claude Code as issue #${result.number}. It posts progress and the pull request there.`);
        void qc.invalidateQueries({ queryKey: ["jarvis", "claude-code"] });
      } catch (error) {
        forget(key);
        toast.error(error instanceof Error ? error.message : "Couldn't send the task to Claude Code.");
      }
      return;
    }
    if (proposal.id === "claude.fix") {
      try {
        const result = await askClaudeFix({ data: { pr: proposal.pr, note: proposal.note } });
        markDone(key, result.url);
        toast.success(
          result.failing.length
            ? `Asked Claude Code to fix pull request #${proposal.pr} (${result.failing.length} failing check${result.failing.length === 1 ? "" : "s"}).`
            : `Asked Claude Code to address the review comments on pull request #${proposal.pr}.`,
        );
      } catch (error) {
        forget(key);
        toast.error(error instanceof Error ? error.message : "Couldn't reach Claude Code.");
      }
      return;
    }
    if (proposal.id === "code.pr") {
      try {
        const result = await openPr({ data: { pr: proposal.pr } });
        markDone(key, result.url);
        toast.success(`Pull request #${result.number} opened. Review and merge it on GitHub.`);
      } catch (error) {
        forget(key);
        toast.error(error instanceof Error ? error.message : "Couldn't open the pull request.");
      }
      return;
    }
    // demo.send opens the review sheet on that demo's build card; the send itself needs a second tap.
    const send = readDemoSendProposal(proposal);
    if (send) {
      // A fresh nonce per approval remounts the card, so a re-approval after Cancel opens the sheet again.
      setSendCards((current) => ({ ...current, [key]: { card: { organizationId: send.organizationId, name: "" }, channel: send.channel, to: send.to, nonce: (current[key]?.nonce ?? 0) + 1 } }));
      return;
    }
    if (proposal.id === "memory.forget") {
      try {
        await forgetJarvisMemoryFn({ data: { memoryId: proposal.memoryId } });
        markDone(key);
        toast.success("Memory forgotten. Jarvis will not bring it back.");
      } catch (error) {
        forget(key);
        toast.error(error instanceof Error ? error.message : "Couldn't forget that memory.");
      }
      return;
    }
    if (proposal.id === "routine.create" || proposal.id === "routine.update") {
      try {
        await saveJarvisRoutineFn({ data: proposal.id === "routine.create" ? { routine: proposal.routine } : { routineId: proposal.routineId, patch: proposal.patch } });
        markDone(key);
        toast.success(proposal.id === "routine.create" ? "Routine created. It runs on its schedule and posts results here." : "Routine updated.");
      } catch (error) {
        forget(key);
        toast.error(error instanceof Error ? error.message : "Couldn't save the routine.");
      }
      return;
    }
    if (proposal.id === "routine.delete") {
      try {
        await deleteJarvisRoutineFn({ data: { routineId: proposal.routineId } });
        markDone(key);
        toast.success("Routine deleted.");
      } catch (error) {
        forget(key);
        toast.error(error instanceof Error ? error.message : "Couldn't delete the routine.");
      }
      return;
    }
    if (proposal.id !== "demo.build") { forget(key); toast.error("This action can't be approved from this page yet."); return; }
    try {
      const result = await buildDemo({ data: proposal.input });
      markDone(key);
      setDemoCards(rememberDemoCard(key, { organizationId: result.organizationId, name: proposal.input.businessName, previewToken: result.previewToken }));
      toast.success(`Building the demo site for ${proposal.input.businessName}. Watch it build below. Track it under Operations → Demo sites.`);
      void qc.invalidateQueries({ queryKey: ["jarvis", "prospect-demos"] });
    } catch (error) {
      forget(key);
      toast.error(error instanceof Error ? error.message : "Couldn't start the build.");
    }
  };
  /** A build started, or "Preview here" tapped, in Operations: show its card at the end of the chat. */
  const showDemo = (demo: DemoCardRef) => {
    setLiveCards((current) => [...current.filter((item) => item.organizationId !== demo.organizationId), demo]);
    if (wide === false) setShowTools(false);
    window.setTimeout(() => { void conversation.current?.scrollToBottom(); }, 60);
  };
  const renderAfterProposal = (key: string) => {
    const sendCard = sendCards[key];
    if (sendCard) {
      return (
        <DemoBuildCard
          key={`${key}:${sendCard.nonce}`}
          card={sendCard.card}
          initialSend={{ channel: sendCard.channel, to: sendCard.to }}
          onInitialSendSettled={(sent) => { if (sent) markDone(key); else forget(key); }}
        />
      );
    }
    const research = researchResults[key];
    if (research) return <ResearchResultCard result={research} />;
    const demo = demoCards[key];
    return demo ? <DemoBuildCard card={demo} /> : null;
  };

  const voiceState: VoiceState = jarvisVoice.speaking ? "speaking" : listening ? "listening" : busy ? "thinking" : "idle";
  const status = jarvisVoice.speaking ? "Speaking…" : listening ? (live ? "Live · listening" : "Listening…") : busy ? "Thinking…" : live ? "Live" : "Ready";
  const sectionStatuses = DIAGNOSTIC_SECTIONS.map(([name]) => diagnostics.data?.sections[name]?.status);
  const unavailable = sectionStatuses.filter((value) => value === "unavailable").length;
  const checks: ChecksSummary = diagnostics.error
    ? { tone: "unavailable", label: "Checks unavailable" }
    : !diagnostics.data
      ? { tone: "unknown", label: diagnostics.isFetching ? "Checking…" : "Not checked" }
      : unavailable
        ? { tone: "unavailable", label: `${unavailable} check${unavailable === 1 ? "" : "s"} unavailable` }
        : sectionStatuses.every((value) => value === "checked")
          ? { tone: "ran", label: "Checks ran" }
          : { tone: "unknown", label: "Checks incomplete" };
  const openChecks = () => {
    setFocusDiagnostics((value) => value + 1);
    if (wide === false) setShowTools(true);
  };
  const prospector: ProspectorState = {
    text: prospectText,
    onTextChange: setProspectText,
    lineCount: prospectLines.length,
    drafting: prospecting.isPending,
    onDraft: () => prospecting.mutate(prospectLines),
    drafts,
    edits,
    onEdit: (index, value) => setEdits((current) => ({ ...current, [index]: value })),
    dncCount: dnc.length,
    onClearDnc: () => saveDnc([]),
    addressConfigured,
    onSuppress: suppressDraft,
    onCopy: (value) => { void copy(value); },
    addressPlaceholder: ADDRESS_PLACEHOLDER,
  };
  const panel = <OperationsPanel diagnostics={diagnostics} acquisition={acquisition} scorecard={capabilityScorecard} prospector={prospector} focusDiagnostics={focusDiagnostics} onShowDemo={showDemo} />;
  const mapsLink = findMapsLink(text);

  return (
    <TooltipProvider delayDuration={300}>
      <div
        ref={rootRef}
        data-revora-jarvis=""
        className="-mx-4 -mb-5 -mt-5 flex flex-col sm:-mx-6 sm:-mb-6 sm:-mt-6 lg:mx-0 xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-6"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col xl:h-full">
          <JarvisHeader
            voiceState={voiceState}
            level={jarvisVoice.level}
            status={status}
            checks={checks}
            onOpenChecks={openChecks}
            speaking={jarvisVoice.speaking}
            onStopSpeaking={stopSpeaking}
            live={live}
            onToggleLive={toggleLive}
            voice={voice}
            onToggleVoice={toggleVoice}
            refreshing={diagnostics.isFetching}
            onRefreshDiagnostics={() => { void diagnostics.refetch(); }}
            onExport={exportChat}
            showOperationsItem={wide === false}
            onOpenOperations={() => setShowTools(true)}
            clearDisabled={clearing.isPending || busy}
            onClear={() => clearing.mutate()}
            onOpenConversations={() => setShowConversations(true)}
          />

          <Conversation contextRef={conversation} className="min-h-0 flex-1" aria-label="Jarvis conversation" aria-live="off">
            <ConversationContent scrollClassName="overscroll-contain" className="mx-auto w-full max-w-[var(--jarvis-measure)] gap-6 px-3 py-4 sm:px-6">
              {history.isLoading ? <p className="text-sm text-muted-foreground">Loading your conversation…</p> : null}
              {history.error ? <p role="alert" className="text-sm text-destructive">Your conversation could not be loaded.</p> : null}
              {canLoadEarlier ? (
                <div className="flex justify-center">
                  <Button type="button" variant="outline" size="sm" data-jarvis-tap="" className="rounded-full" disabled={loadingEarlier} onClick={() => { void loadEarlier(); }}>
                    {loadingEarlier ? "Loading…" : "Load earlier messages"}
                  </Button>
                </div>
              ) : null}
              {empty ? (
                <div className="flex flex-col gap-5 py-6">
                  <div className="space-y-1.5">
                    <p className="text-xl font-semibold">What are we working on?</p>
                    <p className="text-sm text-muted-foreground">Ask anything. Jarvis runs platform checks, reads your code, and proposes fixes as pull requests and demo sites for you to approve. Tap Live to just talk.</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {STARTERS.map(([label, hint, prompt]) => (
                      <button key={label} type="button" disabled={busy} onClick={() => submit(prompt)} className="min-h-16 rounded-xl border border-border bg-card/60 p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
                        <span className="block text-sm font-medium">{label}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
                      </button>
                    ))}
                  </div>
                  <Button type="button" variant="ghost" data-jarvis-tap="" className="self-start" onClick={() => setCommandsOpen(true)}>All commands</Button>
                </div>
              ) : null}
              {messages.map((message, index) => {
                const day = dayKey(message.created_at);
                const newDay = index === 0 || day !== dayKey(messages[index - 1]!.created_at);
                return (
                  <Fragment key={message.id}>
                    {newDay && day ? (
                      <div role="separator" aria-label={dayLabel(message.created_at)} className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="h-px flex-1 bg-border/70" aria-hidden />
                        <span aria-hidden>{dayLabel(message.created_at)}</span>
                        <span className="h-px flex-1 bg-border/70" aria-hidden />
                      </div>
                    ) : null}
                    {message.role === "user" ? (
                      <UserMessage content={message.content} createdAt={message.created_at} />
                    ) : (
                      <AssistantMessage
                        message={message}
                        isLast={message.id === lastAssistantId}
                        busy={busy}
                        regenerating={regen.isPending && message.id === lastAssistantId}
                        speakingThis={jarvisVoice.speaking && speakingId === message.id}
                        approvalState={(key) => approved[key] ?? remembered[key]?.state}
                        approvalUrl={(key) => openedPrs[key] ?? remembered[key]?.url}
                        onApprove={(key, proposal) => { void approveProposal(key, proposal); }}
                        onCopy={(body) => { void copy(body); }}
                        onListen={() => { jarvisVoice.unlock(); void speak(message.content, message.id); }}
                        onStopListening={stopSpeaking}
                        onRegenerate={() => regen.mutate()}
                        renderAfterProposal={renderAfterProposal}
                        onShowSteps={setStepsRun}
                      />
                    )}
                  </Fragment>
                );
              })}
              {liveCards.map((demo) => (
                <DemoBuildCard key={demo.organizationId} card={demo} onDismiss={() => setLiveCards((current) => current.filter((item) => item.organizationId !== demo.organizationId))} />
              ))}
              {pending ? <UserMessage content={pending} /> : null}
              {busy ? (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span aria-hidden><TypingDots /></span>
                  <span>Working<span aria-hidden> · {elapsed}s</span></span>
                </div>
              ) : null}
              {busy && liveRun ? <LiveRunSteps runId={liveRun} /> : null}
              {!busy && !pending && lastMessage?.role === "user" ? (
                <div>
                  <Button type="button" variant="outline" size="sm" data-jarvis-tap="" className="gap-1.5 rounded-full" onClick={() => regen.mutate()}>
                    <RotateCcw className="size-4" aria-hidden />Get a reply
                  </Button>
                </div>
              ) : null}
            </ConversationContent>
            <ConversationScrollButton aria-label="Jump to latest" className="bottom-3 right-3" />
          </Conversation>
          <div role="status" className="sr-only">{announcement}</div>

          <div className="shrink-0 border-t border-border/60 bg-background/95 px-3 pb-2 pt-2 backdrop-blur">
            <div className="mx-auto w-full max-w-[var(--jarvis-measure)]">
              {live ? (
                <LiveSurface
                  state={voiceState}
                  level={jarvisVoice.level}
                  label={jarvisVoice.speaking ? "Speaking…" : listening ? "Listening…" : busy ? "Thinking…" : "Ready"}
                  busy={busy}
                  onTapToTalk={tapToTalk}
                  onEnd={toggleLive}
                />
              ) : null}
              {mapsLink && !busy ? (
                <div className="mb-2">
                  <Button type="button" variant="outline" size="sm" data-jarvis-tap="" className="min-h-11 rounded-full" onClick={() => submit(`${text.trim()}\n\n${DEMO_FROM_MAPS}`)}>
                    Build a demo from this Maps link
                  </Button>
                </div>
              ) : null}
              {followups.length > 0 && !busy ? (
                <div data-jarvis-chips="" aria-label="Suggested follow-ups" className="-mx-3 mb-2 flex gap-2 overflow-x-auto px-3">
                  {followups.map((item) => (
                    <button key={item} type="button" onClick={() => submit(item)} className="h-9 shrink-0 whitespace-nowrap rounded-full border border-border bg-card px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{item}</button>
                  ))}
                </div>
              ) : null}
              <JarvisComposer
                value={text}
                onChange={setText}
                onSubmit={() => submit()}
                maxLength={MAX_LENGTH}
                busy={busy}
                coarse={coarse}
                listening={listening && !live}
                interim={live ? "" : interim}
                onToggleMic={toggleMic}
                readingPicture={readingPicture}
                picturePreview={picturePreview}
                onPicture={(file) => { void attachPicture(file); }}
                mode={mode}
                onModeChange={chooseMode}
                onOpenCommands={() => setCommandsOpen(true)}
                inputRef={input}
              />
              <p className="mt-1.5 hidden text-right text-xs text-muted-foreground md:block">Enter to send · Shift+Enter for a new line · / for commands</p>
            </div>
          </div>
        </div>

        {wide === true ? (
          <aside aria-label="Operations" className="hidden min-h-0 min-w-0 space-y-3 overflow-y-auto overscroll-contain py-4 pr-1 xl:block">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Operations</h2>
            {panel}
          </aside>
        ) : wide === false ? (
          <Sheet open={showTools} onOpenChange={setShowTools}>
            <SheetContent side="bottom" data-jarvis-sheet="" className="h-[85dvh] max-h-[85dvh] gap-0 overflow-hidden rounded-t-2xl p-0 [&>button:first-child]:hidden">
              <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted" aria-hidden />
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 py-1 pl-4 pr-2">
                <SheetHeader className="min-w-0 space-y-0.5 pt-2 text-left sm:text-left">
                  <SheetTitle>Operations</SheetTitle>
                  <SheetDescription>Demo sites, prospects, platform health, autopilot and scorecard.</SheetDescription>
                </SheetHeader>
                <SheetClose asChild>
                  <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 sm:size-11" aria-label="Close operations"><X className="size-5" aria-hidden /></Button>
                </SheetClose>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{panel}</div>
            </SheetContent>
          </Sheet>
        ) : null}

        <ConversationsSheet open={showConversations} onOpenChange={setShowConversations} wide={wide === true} activeId={conversationId}
          onSelect={(id) => { if (id === conversationId) return; setOlder([]); setMoreEarlier(true); setFollowups([]); setConversationId(id); }} />
        <RunStepsSheet runId={stepsRun} open={stepsRun !== null} onOpenChange={(o) => { if (!o) setStepsRun(null); }} wide={wide === true} />
        <CommandPalette open={commandsOpen} onOpenChange={setCommandsOpen} desktop={!coarse} commands={COMMANDS} disabled={busy} onRun={(prompt) => submit(prompt)} />
      </div>
    </TooltipProvider>
  );
}
