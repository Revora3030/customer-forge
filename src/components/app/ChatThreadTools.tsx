/**
 * Conversation tools for the builder chat (spec A): search every saved turn,
 * switch between the main conversation and alternate directions, and dictate
 * a message by voice.
 *
 * Voice uses the browser's own speech recognition when it exists. When it
 * doesn't, the button is hidden and the existing recorded-voice path in the
 * media tray (server transcription) remains the way to speak a request.
 * Nothing is sent automatically: dictated text lands in the message box for
 * the owner to review.
 */
import { useEffect, useRef, useState } from "react";
import { GitBranch, Mic, MicOff, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MAIN_BRANCH } from "@/lib/builder/chat-thread";
import { cn } from "@/lib/utils";

type SearchHit = { turn: { role: "user" | "assistant"; at: string; branch?: string }; snippet: string };

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};

function speechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** One-tap dictation. Renders nothing when the browser has no speech recognition. */
export function VoiceDictationButton({
  onText,
  disabled,
}: {
  onText: (text: string) => void;
  disabled?: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => setSupported(Boolean(speechRecognitionCtor())), []);
  useEffect(() => () => recRef.current?.stop(), []);

  if (!supported) return null;

  const toggle = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (event) => {
      const text = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) onText(text);
    };
    rec.onerror = (event) => {
      setError(event.error === "not-allowed" ? "Microphone permission was denied." : "Voice input stopped.");
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setError(null);
    setListening(true);
    rec.start();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? "Stop voice input" : "Speak your request"}
      title={error ?? (listening ? "Listening… tap to stop" : "Speak your request")}
      className={cn(
        "grid size-9 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50",
        listening && "animate-pulse bg-primary/15 text-primary",
      )}
    >
      {listening ? <MicOff className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
    </button>
  );
}

/** Search box + results for saved conversation turns. */
export function ChatSearch({
  search,
  onPick,
}: {
  search: (query: string) => SearchHit[];
  onPick?: (hit: SearchHit) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const hits = query.trim().length >= 2 ? search(query) : [];

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search this conversation"
        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Search className="size-4" aria-hidden />
      </button>
    );

  return (
    <div className="absolute inset-x-3 top-12 z-20 rounded-xl border border-border bg-popover p-2 shadow-lift" role="search">
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your conversation…"
          aria-label="Search your conversation"
          className="h-9"
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        />
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setQuery("");
          }}
          aria-label="Close search"
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {query.trim().length >= 2 ? (
        <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto" aria-live="polite">
          {hits.length === 0 ? (
            <li className="px-2 py-3 text-center text-[12.5px] text-muted-foreground">No messages match.</li>
          ) : (
            hits.map((hit, index) => (
              <li key={`${hit.turn.at}-${index}`}>
                <button
                  type="button"
                  onClick={() => onPick?.(hit)}
                  className="w-full cursor-pointer rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-muted"
                >
                  <span className="block text-[11px] text-muted-foreground">
                    {hit.turn.role === "user" ? "You" : "Revora"}
                    {hit.turn.branch && hit.turn.branch !== MAIN_BRANCH ? ` · ${hit.turn.branch}` : ""} ·{" "}
                    {new Date(hit.turn.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                  <span className="line-clamp-2">{hit.snippet}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

/** Switch between the main conversation and alternate directions, or start one. */
export function BranchSwitcher({
  branch,
  branches,
  onSwitch,
  disabled,
}: {
  branch: string;
  branches: string[];
  onSwitch: (branch: string) => void;
  disabled?: boolean;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  return (
    <div className="flex items-center gap-1">
      <label className="sr-only" htmlFor="chat-branch">
        Conversation direction
      </label>
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <GitBranch className="size-3.5" aria-hidden />
      </span>
      <select
        id="chat-branch"
        value={branch}
        disabled={disabled}
        onChange={(event) => {
          if (event.target.value === "__new__") setNaming(true);
          else onSwitch(event.target.value);
        }}
        className="h-8 max-w-[9rem] cursor-pointer truncate rounded-full border border-border/70 bg-transparent px-2 text-[12px] text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {branches.map((key) => (
          <option key={key} value={key}>
            {key === MAIN_BRANCH ? "Main" : key}
          </option>
        ))}
        <option value="__new__">+ Try another direction…</option>
      </select>
      {naming ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) onSwitch(name);
            setName("");
            setNaming(false);
          }}
        >
          <Input
            autoFocus
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. darker look"
            aria-label="Name the new direction"
            className="h-8 w-32 text-[12px]"
            onKeyDown={(event) => {
              if (event.key === "Escape") setNaming(false);
            }}
          />
        </form>
      ) : null}
    </div>
  );
}
