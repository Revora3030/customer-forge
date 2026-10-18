import { useCallback, useEffect, useRef, useState } from "react";
import { splitSpeech } from "@/lib/speech-chunks";
import {
  browserSpeechWatchdogMs,
  createPlaybackGate,
  STREAM_STALL_TIMEOUT_MS,
  STREAM_START_TIMEOUT_MS,
  voiceFallbackCode,
  type PlaybackGate,
  type PlaybackOutcome,
  type VoiceFallbackCode,
} from "@/components/app/jarvis-voice-gate";

export type { PlaybackOutcome, VoiceFallbackCode } from "@/components/app/jarvis-voice-gate";

type Synthesize = (text: string) => Promise<{ audioBase64: string; contentType: string }>;
/** Returns a signed link that streams one sentence while it is generated. */
type StreamLink = (text: string) => Promise<string>;
/** Why Jarvis fell back to the browser voice: the readable reason plus a text-free code safe to report. */
type OnFallback = (reason: string, code: VoiceFallbackCode) => void;

// 0.1s of silence: played inside a tap so iOS Safari lets later audio play.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

const toBlobUrl = (audioBase64: string, contentType: string) => {
  const binary = window.atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: contentType }));
};

const hasSpeechSynthesis = () => typeof window !== "undefined" && "speechSynthesis" in window;

/**
 * Jarvis's voice: ElevenLabs, sentence by sentence.
 *
 * - The first sentence is streamed: the audio element plays it while
 *   ElevenLabs is still generating it, so Jarvis starts talking after the
 *   first words. Later sentences are synthesized in full while the one before
 *   plays, so there is no gap between them. A stream that can't play, doesn't
 *   start within 8s or stalls falls back to the full download for that sentence.
 * - One audio element is unlocked on the owner's first tap and reused, so
 *   replies that arrive later (Live mode) are allowed to play on phones. The
 *   same tap warms speechSynthesis once, so the browser-voice fallback may be
 *   audible on iPhones too (unverified until tested on devices).
 * - If ElevenLabs fails, the rest of the reply is read by the browser voice,
 *   one utterance per chunk, each with a watchdog so a dropped utterance can't
 *   hang Jarvis.
 * - speak() resolves to "finished", "stopped" (stop() or a newer speak()) or
 *   "fallback" (the browser voice read some of it). stop() always settles it.
 * - `level` (0..1) animates the waveform while speaking. Audio is not routed
 *   through Web Audio to measure it: on some iPhones that plays silently.
 */
export function useJarvisVoice(synthesize: Synthesize, onFallback?: OnFallback, streamLink?: StreamLink) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const generation = useRef(0);
  const urls = useRef<string[]>([]);
  const frame = useRef<number | null>(null);
  const gateRef = useRef<PlaybackGate | null>(null);
  const liveUtterance = useRef<SpeechSynthesisUtterance | null>(null);
  const active = useRef(false);
  const warmed = useRef(false);
  const lastFallbackRef = useRef<{ reason: string; code: VoiceFallbackCode } | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);

  const gate = useCallback(() => (gateRef.current ??= createPlaybackGate()), []);

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
    if (el && (!el.src || el.src === SILENT_WAV)) {
      el.src = SILENT_WAV;
      void el.play().catch(() => undefined);
    }
    // iOS ignores speechSynthesis.speak() until it has run once inside a
    // gesture: speak one silent space now, once per hook.
    if (!warmed.current && hasSpeechSynthesis()) {
      warmed.current = true;
      try {
        const warm = new SpeechSynthesisUtterance(" ");
        warm.volume = 0;
        window.speechSynthesis.speak(warm);
        window.speechSynthesis.getVoices();
      } catch {
        /* no browser voice here; the ElevenLabs path is unaffected */
      }
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
    // Pausing fires no "ended": settle the in-flight clip so speak() resolves.
    gate().settle("stopped");
    liveUtterance.current = null;
    audio.current?.pause();
    if (hasSpeechSynthesis()) window.speechSynthesis.cancel();
    release();
    active.current = false;
    setSpeaking(false);
  }, [gate, release]);

  /** Stops Jarvis mid-sentence; true when it was speaking. */
  const interrupt = useCallback(() => {
    const was = active.current;
    stop();
    return was;
  }, [stop]);

  /** Reads each chunk as its own utterance; resolves "fallback", or "stopped" when stopped. */
  const browserVoice = async (chunks: string[], gen: number): Promise<PlaybackOutcome> => {
    if (!hasSpeechSynthesis()) return gen === generation.current ? "fallback" : "stopped";
    window.speechSynthesis.cancel();
    for (const chunk of chunks) {
      if (gen !== generation.current) return "stopped";
      const wait = gate().begin();
      const utterance = new SpeechSynthesisUtterance(chunk);
      liveUtterance.current = utterance;
      // A cancelled earlier utterance may still fire its events: only this one counts.
      const done = () => {
        if (liveUtterance.current === utterance) gate().settle("finished");
      };
      utterance.onend = done;
      utterance.onerror = done;
      const watchdog = window.setTimeout(done, browserSpeechWatchdogMs(chunk.length));
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        done();
      }
      const outcome = await wait;
      window.clearTimeout(watchdog);
      if (outcome === "stopped") return "stopped";
    }
    liveUtterance.current = null;
    return gen === generation.current ? "fallback" : "stopped";
  };

  /**
   * Plays one clip. Resolves "finished" or "stopped"; rejects when it can't
   * play. A stream link also rejects when it hasn't started playing within
   * STREAM_START_TIMEOUT_MS or stalls with no progress, so the caller can use
   * the buffered download instead.
   */
  const playUrl = (url: string, gen: number, stream: boolean) =>
    new Promise<PlaybackOutcome>((resolve, reject) => {
      const el = element();
      if (!el || gen !== generation.current) return resolve("stopped");
      const wait = gate().begin();
      let failure: Error | null = null;
      let started = false;
      let startTimer: number | undefined;
      let stallTimer: number | undefined;
      const fail = (message: string) => {
        failure ??= new Error(message);
        gate().settle("fallback");
      };
      const cleanup = () => {
        window.clearTimeout(startTimer);
        window.clearTimeout(stallTimer);
        el.onended = null;
        el.onerror = null;
        el.onplaying = null;
        el.onstalled = null;
        el.onwaiting = null;
      };
      void wait.then((outcome) => {
        cleanup();
        if (outcome === "fallback") {
          el.pause();
          reject(failure ?? new Error("Audio could not be played."));
        } else resolve(outcome);
      });
      el.onended = () => gate().settle("finished");
      el.onerror = () => fail("Audio could not be played.");
      if (stream) {
        startTimer = window.setTimeout(() => {
          if (!started) fail("The voice stream did not start in time.");
        }, STREAM_START_TIMEOUT_MS); // DevSkim: ignore DS172411 -- Fixed callback and constant delay; no untrusted data.
        el.onplaying = () => {
          started = true;
          window.clearTimeout(startTimer);
        };
        const watchStall = () => {
          if (stallTimer !== undefined) return;
          const at = el.currentTime;
          stallTimer = window.setTimeout(() => {
            stallTimer = undefined;
            if (!el.ended && el.currentTime <= at) fail("The voice stream stalled.");
          }, STREAM_STALL_TIMEOUT_MS); // DevSkim: ignore DS172411 -- Fixed callback and constant delay; no untrusted data.
        };
        el.onstalled = watchStall;
        el.onwaiting = watchStall;
      }
      el.src = url;
      el.play().catch((error: unknown) => fail(error instanceof Error ? error.message : "Audio could not be played."));
    });

  /** Speaks a reply; resolves when it finished, was stopped, or fell back to the browser voice. */
  const speak = useCallback(
    async (text: string): Promise<PlaybackOutcome> => {
      stop();
      const gen = generation.current;
      const chunks = splitSpeech(text);
      if (!chunks.length) return "finished";
      active.current = true;
      lastFallbackRef.current = null;
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
      const fallBack = (reason: string, from: number) => {
        const code = voiceFallbackCode(reason);
        lastFallbackRef.current = { reason, code };
        onFallback?.(reason, code);
        return browserVoice(chunks.slice(from), gen);
      };
      try {
        let start = 0;
        if (streamLink) {
          // Stream the first sentence; download the second while it plays.
          fetchChunk(1);
          let streamed = false;
          try {
            const link = await streamLink(chunks[0]!);
            if (gen !== generation.current) return "stopped";
            if ((await playUrl(link, gen, true)) === "stopped") return "stopped";
            streamed = true;
          } catch {
            // Older deploys, a stream that never starts or stalls, or a browser
            // that won't play a live stream: use the full download instead.
          }
          if (streamed) start = 1;
        }
        if (gen !== generation.current) return "stopped";
        if (start === 0) fetchChunk(0);
        for (let i = start; i < chunks.length; i += 1) {
          if (gen !== generation.current) return "stopped";
          fetchChunk(i + 1); // synthesize the next sentence while this one plays
          let url: string;
          try {
            url = await pending.get(i)!;
          } catch (error) {
            if (gen !== generation.current) return "stopped";
            return await fallBack(error instanceof Error ? error.message : "ElevenLabs was unavailable.", i);
          }
          if (gen !== generation.current) return "stopped";
          try {
            if ((await playUrl(url, gen, false)) === "stopped") return "stopped";
          } catch {
            return await fallBack("This browser blocked the audio. Tap Listen to hear it.", i);
          }
        }
        return "finished";
      } finally {
        if (gen === generation.current) {
          release();
          active.current = false;
          setSpeaking(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [synthesize, onFallback, streamLink, stop, meter, release],
  );

  /** The reason and code of the latest fallback to the browser voice, or null. */
  const lastFallback = useCallback(() => lastFallbackRef.current, []);

  useEffect(() => () => stop(), [stop]);

  return { speak, stop, interrupt, unlock, speaking, level, lastFallback };
}
