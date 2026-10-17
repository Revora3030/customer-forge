import { Link, useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, ExternalLink, Mic, MicOff, RefreshCw, Send, Square, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { JarvisMarkdown } from "@/components/app/JarvisMarkdown";
import { useJarvisVoice } from "@/components/app/use-jarvis-voice";
import { getJarvisPageBrief, sendJarvisMessage } from "@/lib/jarvis.functions";
import { jarvisVoiceLinks, synthesizeJarvisVoice } from "@/lib/jarvis-voice.functions";
import { speakableText, splitReplyMeta } from "@/lib/jarvis-actions";
import { adminPath } from "@/lib/jarvis-page-context";

type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionConstructor = new () => Recognition;

const PREFS_KEY = "revora.jarvis-dock";
type Prefs = { voice: boolean; autoBrief: boolean };

function readPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>;
    return { voice: raw.voice === true, autoBrief: raw.autoBrief === true };
  } catch {
    return { voice: false, autoBrief: false };
  }
}

function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* private window: preferences last for this visit only */
  }
}

/**
 * Jarvis on every admin page. The panel shows the live facts for the page
 * you're on (refreshed every minute), reads them aloud on request or each
 * time you change page, and answers questions knowing which page you're on.
 * Conversations go into the same thread as the full Jarvis page.
 */
export function JarvisDock() {
  const location = useLocation();
  const page = adminPath(location.pathname) ?? "/admin";
  const onJarvisPage = page === "/admin/jarvis";
  const qc = useQueryClient();
  const fetchBrief = useServerFn(getJarvisPageBrief);
  const send = useServerFn(sendJarvisMessage);
  const synthesize = useServerFn(synthesizeJarvisVoice);
  const voiceLinks = useServerFn(jarvisVoiceLinks);

  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({ voice: false, autoBrief: false });
  const [text, setText] = useState("");
  const [reply, setReply] = useState<{ body: string; followups: string[]; proposals: number } | null>(null);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const unlocked = useRef(false);
  const lastBriefed = useRef<string | null>(null);

  useEffect(() => setPrefs(readPrefs()), []);
  const updatePrefs = (next: Partial<Prefs>) =>
    setPrefs((current) => {
      const merged = { ...current, ...next };
      savePrefs(merged);
      return merged;
    });

  const voiceSynth = useCallback((value: string) => synthesize({ data: { text: value } }), [synthesize]);
  const onFallback = useCallback(() => {
    toast.message("Using your browser voice because ElevenLabs was unavailable.");
  }, []);
  const voiceStream = useCallback(
    async (value: string) => (await voiceLinks({ data: { texts: [value] } })).urls[0]!,
    [voiceLinks],
  );
  const voice = useJarvisVoice(voiceSynth, onFallback, voiceStream);

  // Browsers only allow sound after a tap, so every button that may lead to
  // speech unlocks audio first.
  const unlock = () => {
    unlocked.current = true;
    voice.unlock();
  };

  const brief = useQuery({
    queryKey: ["jarvis", "page-brief", page],
    queryFn: () => fetchBrief({ data: { page } }),
    enabled: !onJarvisPage,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const attention = brief.data?.facts.filter((fact) => fact.tone === "attention" && fact.value !== null).length ?? 0;

  // Hands-free page briefs: once audio is unlocked, read each new page's brief.
  useEffect(() => {
    if (!prefs.autoBrief || !prefs.voice || !unlocked.current || !brief.data) return;
    if (lastBriefed.current === page) return;
    lastBriefed.current = page;
    void voice.speak(brief.data.spoken);
  }, [brief.data, page, prefs.autoBrief, prefs.voice, voice]);

  const ask = useMutation({
    mutationFn: (message: string) => send({ data: { message, mode: "brief", page } }),
    onSuccess: async (result) => {
      const { body, meta } = splitReplyMeta(result.reply);
      setReply({ body, followups: result.followups ?? [], proposals: meta.proposals.length });
      void qc.invalidateQueries({ queryKey: ["jarvis", "history"] });
      if (prefs.voice) {
        const clean = speakableText(body);
        if (clean) await voice.speak(clean);
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Jarvis couldn't answer just now."),
  });

  const submit = (message: string) => {
    const value = message.trim();
    if (!value || ask.isPending) return;
    unlock();
    setText("");
    ask.mutate(value);
  };

  const listen = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    unlock();
    const browser = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Ctor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Ctor) {
      toast.error("Voice input isn't available in this browser. Type instead.");
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (event) => {
      const transcript = String(event.results[0]?.[0]?.transcript ?? "").trim();
      if (transcript) submit(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => {
      setListening(false);
      toast.error("Voice input failed. You can still type.");
    };
    recognition.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      toast.error("The microphone couldn't start.");
    }
  };

  useEffect(() => () => recognition.current?.stop(), []);

  if (onJarvisPage) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          unlock();
          setOpen((value) => !value);
        }}
        aria-label={open ? "Close Jarvis" : "Open Jarvis"}
        aria-expanded={open}
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 flex size-12 items-center justify-center rounded-full border border-border bg-card shadow-lg transition hover:bg-elevated"
      >
        {voice.speaking ? <Volume2 className="size-5 animate-pulse" aria-hidden /> : <Bot className="size-5" aria-hidden />}
        {attention > 0 && !open ? (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold text-destructive-foreground">
            {attention}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          aria-label="Jarvis"
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex max-h-[min(78dvh,640px)] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        >
          <header className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Bot className="size-4" aria-hidden />
            <p className="min-w-0 flex-1 truncate text-sm font-medium">
              Jarvis · {brief.data?.title ?? "Admin"}
            </p>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={prefs.voice ? "Turn voice off" : "Turn voice on"}
              aria-pressed={prefs.voice}
              onClick={() => {
                unlock();
                if (prefs.voice) voice.stop();
                updatePrefs({ voice: !prefs.voice });
              }}
            >
              {prefs.voice ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </Button>
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Close Jarvis" onClick={() => setOpen(false)}>
              <X className="size-4" />
            </Button>
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            <div className="rounded-lg border border-border p-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">On this page, live</p>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Refresh page facts"
                  onClick={() => void brief.refetch()}
                >
                  <RefreshCw className={`size-3.5 ${brief.isFetching ? "animate-spin" : ""}`} />
                </Button>
              </div>
              {brief.error ? (
                <p className="text-xs text-muted-foreground">Jarvis couldn't read this page's numbers. Try refresh.</p>
              ) : brief.data ? (
                <ul className="space-y-1">
                  {brief.data.facts.map((fact) => (
                    <li key={fact.label} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                      <span className={fact.tone === "attention" && fact.value ? "font-medium text-destructive" : "text-muted-foreground"}>
                        {fact.label}
                      </span>
                      <span className="shrink-0 tabular-nums">{fact.value === null ? "couldn't read" : String(fact.value)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Reading this page…</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!brief.data}
                  onClick={() => {
                    unlock();
                    if (voice.speaking) voice.stop();
                    else if (brief.data) void voice.speak(brief.data.spoken);
                  }}
                >
                  {voice.speaking ? <Square className="mr-1.5 size-3.5" /> : <Volume2 className="mr-1.5 size-3.5" />}
                  {voice.speaking ? "Stop" : "Read this page to me"}
                </Button>
                <label className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={prefs.autoBrief}
                    onChange={(event) => {
                      unlock();
                      lastBriefed.current = page;
                      updatePrefs({ autoBrief: event.target.checked, ...(event.target.checked ? { voice: true } : {}) });
                    }}
                  />
                  Brief me on each page
                </label>
              </div>
            </div>

            {ask.isPending ? <p className="text-xs text-muted-foreground">Jarvis is thinking…</p> : null}
            {reply ? (
              <div className="space-y-2">
                <div className="text-[13px]">
                  <JarvisMarkdown>{reply.body}</JarvisMarkdown>
                </div>
                {reply.proposals ? (
                  <Link
                    to="/admin/jarvis"
                    className="block rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-[12px] font-medium text-primary hover:underline"
                  >
                    Jarvis proposed {reply.proposals === 1 ? "an action" : `${reply.proposals} actions`} (a pull request, Claude Code task or build). Open full Jarvis to review and approve.
                  </Link>
                ) : null}
                {reply.followups.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {reply.followups.map((followup) => (
                      <button
                        key={followup}
                        type="button"
                        onClick={() => submit(followup)}
                        className="rounded-full border border-border px-2.5 py-1 text-left text-[11.5px] hover:bg-muted"
                      >
                        {followup}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <form
            className="flex items-end gap-2 border-t border-border p-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit(text);
            }}
          >
            <Textarea
              className="max-h-28 min-h-10 flex-1 resize-none text-[13px]"
              rows={1}
              aria-label="Ask Jarvis about this page"
              placeholder="Ask about this page…"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit(text);
                }
              }}
            />
            <Button type="button" size="icon-sm" variant={listening ? "signal" : "ghost"} aria-label={listening ? "Stop listening" : "Talk to Jarvis"} onClick={listen}>
              {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </Button>
            <Button type="submit" size="icon-sm" aria-label="Send" disabled={ask.isPending || !text.trim()}>
              <Send className="size-4" />
            </Button>
          </form>
          <Link
            to="/admin/jarvis"
            className="flex items-center justify-center gap-1 border-t border-border py-1.5 text-[11.5px] text-muted-foreground hover:text-foreground"
          >
            Open full Jarvis <ExternalLink className="size-3" aria-hidden />
          </Link>
        </section>
      ) : null}
    </>
  );
}
