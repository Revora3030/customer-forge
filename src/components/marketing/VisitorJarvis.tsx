import { Link, useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Bot, Mic, MicOff, Send, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askVisitorJarvis } from "@/lib/visitor-jarvis.functions";
import { VISITOR_ACTION_LABEL, type VisitorAction, type VisitorTurn } from "@/lib/visitor-jarvis";
import { trackConversion } from "@/lib/conversion";
import { saveStarter } from "@/components/marketing/hero-starter-utils";
import { useSession } from "@/lib/auth-session";
import { FREE_ACCESS_SEARCH, FREE_ACCESS_TO } from "@/components/marketing/FreeAccess";
import { GROWTH_SYSTEM } from "@/lib/offer";

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

const SEEN_KEY = "revora:jarvis-greeted";
const GREETING = `Hi, I'm Jarvis. I can show you how Revora would win more customers for your business — what do you do, and where?`;
const STARTERS = ["What do I get for the price?", "I already have a website", "How fast is it built?", "Does it work for my trade?"];

type Message = VisitorTurn & { action?: VisitorAction | null };

/**
 * Jarvis for every visitor to Revora's marketing pages. Answers questions from
 * the real offer, speaks replies aloud when the visitor turns sound on (the
 * browser's own voice, so it costs nothing), listens through the microphone,
 * and offers the right next step: start free, upgrade an existing site, a free
 * audit, or pricing.
 */
export function VisitorJarvis() {
  const { loading, user } = useSession();
  const location = useLocation();
  const ask = useServerFn(askVisitorJarvis);
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: GREETING }]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const end = useRef<HTMLDivElement>(null);

  // A one-time hello bubble, once per browser session, after the visitor has
  // had a few seconds with the page.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SEEN_KEY)) return;
    } catch {
      return;
    }
    const timer = window.setTimeout(() => {
      setNudge(true);
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* private mode */
      }
    }, 8000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  useEffect(() => () => {
    recognition.current?.stop();
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* no speech support */
    }
  }, []);

  const speak = (content: string) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(content.replace(/https?:\/\/\S+/g, "").slice(0, 900));
      utterance.rate = 1.03;
      synth.speak(utterance);
    } catch {
      /* speech unavailable: the reply is on screen */
    }
  };

  const send = async (raw: string) => {
    const value = raw.trim();
    if (!value || busy) return;
    setText("");
    if (/already have a (web)?site|existing (web)?site|my (current|own) (web)?site|redo my site|upgrade my site/i.test(value))
      saveStarter({ wantsImport: true });
    const next: Message[] = [...messages, { role: "user", content: value }];
    setMessages(next);
    setBusy(true);
    try {
      const result = await ask({
        data: { turns: next.map(({ role, content }) => ({ role, content })), page: location.pathname },
      });
      setMessages((current) => [...current, { role: "assistant", content: result.reply, action: result.action }]);
      if (voice) speak(result.reply);
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `I couldn't answer just now. You can try everything free for ${GROWTH_SYSTEM.fullAccessWindow} with no card.`,
          action: "start",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const listen = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const browser = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Ctor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Ctor) {
      setMessages((current) => [...current, { role: "assistant", content: "Voice input isn't available in this browser — type your question instead." }]);
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (event) => {
      const transcript = String(event.results[0]?.[0]?.transcript ?? "").trim();
      if (transcript) void send(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognition.current = rec;
    try {
      rec.start();
      setListening(true);
      setVoice(true);
    } catch {
      setListening(false);
    }
  };

  const follow = (action: VisitorAction) => {
    if (action === "upgrade") saveStarter({ wantsImport: true });
    trackConversion("cta_click", { metadata: { source: "visitor_jarvis", action } });
  };

  // Signed-in owners have their own Jarvis in the workspace.
  if (loading || user) return null;

  return (
    <>
      {nudge && !open ? (
        <button
          type="button"
          onClick={() => {
            setNudge(false);
            setOpen(true);
          }}
          className="jarvis-launcher animate-in fade-in slide-in-from-bottom-2 fixed right-4 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-40 max-w-[260px] rounded-xl border border-primary/40 bg-card p-3 text-left text-[12.5px] shadow-xl"
        >
          {GREETING}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => {
          setNudge(false);
          setOpen((value) => !value);
        }}
        aria-label={open ? "Close Jarvis" : "Ask Jarvis about Revora"}
        aria-expanded={open}
        className="jarvis-launcher fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex h-12 items-center gap-2 rounded-full border border-primary/50 bg-card px-4 text-[13px] font-medium shadow-lg transition hover:bg-elevated"
      >
        {open ? <X className="size-4" aria-hidden /> : <Bot className="size-4 text-primary" aria-hidden />}
        {open ? "Close" : "Ask Jarvis"}
      </button>

      {open ? (
        <section
          aria-label="Chat with Jarvis"
          className="fixed right-4 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-40 flex max-h-[min(70dvh,560px)] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        >
          <header className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Bot className="size-4 text-primary" aria-hidden />
            <p className="flex-1 text-sm font-medium">Jarvis · Revora's AI</p>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={voice ? "Stop reading replies aloud" : "Read replies aloud"}
              aria-pressed={voice}
              onClick={() => {
                if (voice) window.speechSynthesis?.cancel();
                setVoice(!voice);
              }}
            >
              {voice ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </Button>
          </header>
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3" aria-live="polite">
            {messages.map((message, index) => (
              <div key={index} className={message.role === "user" ? "flex justify-end" : ""}>
                <p
                  className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
                    message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  {message.content}
                </p>
                {message.action ? <ActionButton action={message.action} onFollow={follow} /> : null}
              </div>
            ))}
            {messages.length === 1 ? (
              <div className="flex flex-wrap gap-1.5">
                {STARTERS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => void send(starter)}
                    className="min-h-9 rounded-full border border-border px-3 text-[12px] hover:bg-muted"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            ) : null}
            {busy ? <p className="text-[12px] text-muted-foreground">Jarvis is typing…</p> : null}
            <div ref={end} />
          </div>
          <form
            className="flex items-center gap-2 border-t border-border p-2"
            onSubmit={(event) => {
              event.preventDefault();
              void send(text);
            }}
          >
            <input
              className="min-h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-[13px]"
              aria-label="Ask Jarvis a question"
              placeholder="Ask anything about Revora…"
              maxLength={800}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <Button type="button" size="icon-sm" variant={listening ? "signal" : "ghost"} aria-label={listening ? "Stop listening" : "Talk to Jarvis"} onClick={listen}>
              {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </Button>
            <Button type="submit" size="icon-sm" aria-label="Send" disabled={busy || !text.trim()}>
              <Send className="size-4" />
            </Button>
          </form>
          <p className="border-t border-border px-3 py-1.5 text-[10.5px] text-muted-foreground">
            AI answers about Revora. Don't share passwords or card details here.
          </p>
        </section>
      ) : null}
    </>
  );
}

function ActionButton({ action, onFollow }: { action: VisitorAction; onFollow: (action: VisitorAction) => void }) {
  const label = (
    <>
      {VISITOR_ACTION_LABEL[action]}
      <ArrowRight className="size-3.5" aria-hidden />
    </>
  );
  return (
    <Button asChild size="sm" variant="signal" className="mt-1.5">
      {action === "audit" ? (
        <Link to="/website-audit" onClick={() => onFollow(action)}>{label}</Link>
      ) : action === "pricing" ? (
        <Link to="/pricing" onClick={() => onFollow(action)}>{label}</Link>
      ) : (
        <Link to={FREE_ACCESS_TO} search={FREE_ACCESS_SEARCH} onClick={() => onFollow(action)}>{label}</Link>
      )}
    </Button>
  );
}
