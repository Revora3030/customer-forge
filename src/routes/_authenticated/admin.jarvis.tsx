import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Bot, Mic, MicOff, Send, Trash2, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { ErrorNote, LoadingRows, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageResponse } from "@/components/ai-elements/message";
import { clearJarvisHistory, getJarvisHistory, sendJarvisMessage } from "@/lib/jarvis.functions";

export const Route = createFileRoute("/_authenticated/admin/jarvis")({
  head: () => ({
    meta: [
      { title: "Jarvis growth assistant — Revora admin" },
      { name: "description", content: "Talk or type with Jarvis, Revora's free AI growth assistant for customers and Google visibility." },
      { property: "og:title", content: "Jarvis growth assistant — Revora admin" },
      { property: "og:description", content: "Free AI growth assistant for the Revora owner." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Jarvis,
});

type Msg = { id: string; role: "user" | "assistant"; content: string };

const STARTERS = [
  "What should I do this week to get my first paying customers?",
  "Check my site for Google and tell me what to fix.",
  "Write 3 outreach emails for local service businesses.",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRec = any;

function speakable(text: string) {
  return text.replace(/[#*_`>|-]+/g, " ").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").slice(0, 1500);
}

function Jarvis() {
  const load = useServerFn(getJarvisHistory);
  const send = useServerFn(sendJarvisMessage);
  const clear = useServerFn(clearJarvisHistory);
  const qc = useQueryClient();
  const history = useQuery({ queryKey: ["jarvis"], queryFn: () => load() });
  const [pending, setPending] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [voiceOn, setVoiceOn] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const mutation = useMutation({
    mutationFn: (message: string) => send({ data: { message } }),
    onMutate: (message) => setPending(message),
    onSuccess: (res) => {
      if (voiceOn && typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(speakable(res.reply)));
      }
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ["jarvis"] });
      setPending(null);
      inputRef.current?.focus();
    },
  });
  const clearing = useMutation({
    mutationFn: () => clear(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jarvis"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const messages: Msg[] = [...(history.data ?? [])];
  if (pending) messages.push({ id: "pending", role: "user", content: pending });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, mutation.isPending]);
  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => () => recRef.current?.stop?.(), []);

  const submit = (value = text) => {
    const message = value.trim();
    if (!message || mutation.isPending) return;
    setText("");
    mutation.mutate(message);
  };

  const toggleMic = () => {
    const W = window as unknown as { SpeechRecognition?: SpeechRec; webkitSpeechRecognition?: SpeechRec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) return toast.error("Voice input isn't supported in this browser. Try Chrome or Safari.");
    if (listening) return recRef.current?.stop();
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e: SpeechRec) => {
      const said = String(e.results?.[0]?.[0]?.transcript ?? "");
      setVoiceOn(true);
      submit(said);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  return (
    <div className="product-page flex h-[calc(100dvh-7rem)] flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <SectionHeading title="Jarvis" description="Your free AI growth partner. Ask about customers, Google, outreach — type or talk." />
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon-sm" aria-label={voiceOn ? "Mute spoken replies" : "Speak replies aloud"} onClick={() => { setVoiceOn((v) => !v); window.speechSynthesis?.cancel(); }}>
            {voiceOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Clear chat" disabled={clearing.isPending} onClick={() => { if (confirm("Clear the whole Jarvis chat?")) clearing.mutate(); }}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      {history.error ? <ErrorNote message={(history.error as Error).message} /> : null}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-card p-4">
        {history.isLoading ? (
          <LoadingRows rows={4} />
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="size-6" /></div>
            <p className="max-w-sm text-[13px] text-muted-foreground">Jarvis sees your real signups, trials, paying customers and a live Google check of revoragrowthsystems.com.</p>
            <div className="flex flex-col gap-2">
              {STARTERS.map((s) => (
                <Button key={s} variant="outline" size="sm" className="h-auto whitespace-normal text-left" onClick={() => submit(s)}>{s}</Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-primary px-3.5 py-2 text-[14px] text-primary-foreground">{m.content}</div>
                </div>
              ) : (
                <div key={m.id} className="flex gap-2.5">
                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="size-4" /></div>
                  <MessageResponse className="min-w-0 flex-1 text-[14px]">{m.content}</MessageResponse>
                </div>
              ),
            )}
            {mutation.isPending ? <p className="pl-10 text-[13px] text-muted-foreground animate-pulse">Jarvis is thinking…</p> : null}
            <div ref={endRef} />
          </div>
        )}
      </div>
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Ask Jarvis anything…"
          rows={2}
          className="min-h-[44px] flex-1 resize-none"
        />
        <Button type="button" variant={listening ? "signal" : "outline"} size="icon" aria-label={listening ? "Stop listening" : "Talk to Jarvis"} onClick={toggleMic}>
          {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
        </Button>
        <Button type="submit" variant="signal" size="icon" aria-label="Send" disabled={!text.trim() || mutation.isPending}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
