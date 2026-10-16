import { useCallback, useEffect, useRef, useState } from "react";
import { splitSpeech } from "@/lib/speech-chunks";

type Synthesize = (text: string) => Promise<{ audioBase64: string; contentType: string }>;
/** Returns a signed link that streams one sentence while it is generated. */
type StreamLink = (text: string) => Promise<string>;

// 0.1s of silence: played inside a tap so iOS Safari lets later audio play.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

const toBlobUrl = (audioBase64: string, contentType: string) => {
  const binary = window.atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: contentType }));
};

/**
 * Jarvis's voice: ElevenLabs, sentence by sentence.
 *
 * - The first sentence is streamed: the audio element plays it while
 *   ElevenLabs is still generating it, so Jarvis starts talking after the
 *   first words. Later sentences are synthesized in full while the one before
 *   plays, so there is no gap between them. A stream that can't play falls
 *   back to the full download for that sentence.
 * - One audio element is unlocked on the owner's first tap and reused, so
 *   replies that arrive later (Live mode) are allowed to play on phones.
 * - If ElevenLabs fails, the rest of the reply is read by the browser voice.
 * - `level` (0..1) animates the waveform while speaking. Audio is not routed
 *   through Web Audio to measure it: on some iPhones that plays silently.
 */
export function useJarvisVoice(synthesize: Synthesize, onFallback?: (reason: string) => void, streamLink?: StreamLink) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const generation = useRef(0);
  const urls = useRef<string[]>([]);
  const frame = useRef<number | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);

  const element = useCallback(() => {
    if (!audio.current && typeof Audio !== "undefined") {
      const el = new Audio();
      el.preload = "auto";
      el.setAttribute("playsinline", "true");
      audio.current = el;
    }
    return audio.current;
  }, []);

  /** Call from a tap or click. Safe to call repeatedly. */
  const unlock = useCallback(() => {
    const el = element();
    if (!el) return;
    if (!el.src || el.src === SILENT_WAV) {
      el.src = SILENT_WAV;
      void el.play().catch(() => undefined);
    }
  }, [element]);

  const meter = useCallback(() => {
    let last = 0;
    const tick = (now: number) => {
      // About 12 updates a second: a speech-like rise and fall.
      if (now - last > 80) {
        last = now;
        setLevel(0.35 + 0.65 * Math.abs(Math.sin(now / 170) * Math.sin(now / 410)));
      }
      frame.current = window.requestAnimationFrame(tick);
    };
    if (frame.current === null) frame.current = window.requestAnimationFrame(tick);
  }, []);

  const release = useCallback(() => {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    frame.current = null;
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current = [];
    setLevel(0);
  }, []);

  const stop = useCallback(() => {
    generation.current += 1;
    audio.current?.pause();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    release();
    setSpeaking(false);
  }, [release]);

  const browserVoice = (text: string, gen: number) =>
    new Promise<void>((resolve) => {
      if (!("speechSynthesis" in window) || gen !== generation.current) return resolve();
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });

  const playUrl = (url: string, gen: number) =>
    new Promise<void>((resolve, reject) => {
      const el = element();
      if (!el || gen !== generation.current) return resolve();
      el.onended = () => resolve();
      el.onerror = () => reject(new Error("Audio could not be played."));
      el.src = url;
      el.play().catch(reject);
    });

  /** Speaks a reply; resolves when finished or stopped. */
  const speak = useCallback(
    async (text: string) => {
      stop();
      const gen = generation.current;
      const chunks = splitSpeech(text);
      if (!chunks.length) return;
      setSpeaking(true);
      meter();
      const pending = new Map<number, Promise<string>>();
      const buffered = (i: number) =>
        synthesize(chunks[i]!).then(({ audioBase64, contentType }) => {
          const url = toBlobUrl(audioBase64, contentType);
          urls.current.push(url);
          return url;
        });
      const fetchChunk = (i: number) => {
        if (i >= chunks.length || pending.has(i)) return;
        const job = buffered(i);
        job.catch(() => undefined);
        pending.set(i, job);
      };
      try {
        let start = 0;
        if (streamLink) {
          // Stream the first sentence; download the second while it plays.
          fetchChunk(1);
          let streamed = false;
          try {
            const link = await streamLink(chunks[0]!);
            if (gen !== generation.current) return;
            await playUrl(link, gen);
            streamed = true;
          } catch {
            // Older deploys or a browser that won't play a live stream: use the
            // full download for this sentence instead.
          }
          if (streamed) start = 1;
        }
        if (start === 0) fetchChunk(0);
        for (let i = start; i < chunks.length; i += 1) {
          if (gen !== generation.current) return;
          fetchChunk(i + 1); // synthesize the next sentence while this one plays
          let url: string;
          try {
            url = await pending.get(i)!;
          } catch (error) {
            onFallback?.(error instanceof Error ? error.message : "ElevenLabs was unavailable.");
            await browserVoice(chunks.slice(i).join(" "), gen);
            return;
          }
          if (gen !== generation.current) return;
          try {
            await playUrl(url, gen);
          } catch {
            onFallback?.("This browser blocked the audio. Tap Listen to hear it.");
            await browserVoice(chunks.slice(i).join(" "), gen);
            return;
          }
        }
      } finally {
        if (gen === generation.current) {
          release();
          setSpeaking(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [synthesize, onFallback, streamLink, stop, meter, release],
  );

  useEffect(() => () => stop(), [stop]);

  return { speak, stop, unlock, speaking, level };
}
