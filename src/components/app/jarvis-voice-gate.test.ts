import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  browserSpeechWatchdogMs,
  createPlaybackGate,
  firstFallbackThisPage,
  STREAM_START_TIMEOUT_MS,
  voiceFallbackCode,
} from "@/components/app/jarvis-voice-gate";

describe("Jarvis playback gate", () => {
  it("stop settles a pending play as 'stopped'", async () => {
    const gate = createPlaybackGate();
    const play = gate.begin();
    expect(gate.pending()).toBe(true);
    gate.settle("stopped");
    await expect(play).resolves.toBe("stopped");
    expect(gate.pending()).toBe(false);
  });

  it("settles once; a later settle is ignored", async () => {
    const gate = createPlaybackGate();
    const play = gate.begin();
    gate.settle("finished");
    gate.settle("fallback");
    await expect(play).resolves.toBe("finished");
  });

  it("a new clip settles the previous wait as 'stopped'", async () => {
    const gate = createPlaybackGate();
    const first = gate.begin();
    const second = gate.begin();
    gate.settle("finished");
    await expect(first).resolves.toBe("stopped");
    await expect(second).resolves.toBe("finished");
  });

  it("estimates the browser-voice watchdog per chunk", () => {
    expect(browserSpeechWatchdogMs(0)).toBe(7000);
    expect(browserSpeechWatchdogMs(10)).toBe(7000);
    expect(browserSpeechWatchdogMs(100)).toBe(12_000);
    expect(browserSpeechWatchdogMs(420)).toBe(420 * 90 + 3000);
    expect(STREAM_START_TIMEOUT_MS).toBe(8000);
  });

  it("maps hook reasons to codes and reports each code once per page", () => {
    expect(voiceFallbackCode("No ElevenLabs link for this sentence.")).toBe("no_link");
    expect(voiceFallbackCode("This browser blocked the audio. Tap Listen to hear it.")).toBe("playback_blocked");
    expect(voiceFallbackCode("Today's ElevenLabs voice budget is used up.")).toBe("budget_exhausted");
    expect(voiceFallbackCode("something odd")).toBe("unavailable");
    expect(firstFallbackThisPage("gate-test")).toBe(true);
    expect(firstFallbackThisPage("gate-test")).toBe(false);
  });
});

describe("Jarvis voice hook contracts", () => {
  const hook = readFileSync("src/components/app/use-jarvis-voice.ts", "utf8");

  it("keeps its signature and settles in-flight playback on stop", () => {
    expect(hook).toContain("export function useJarvisVoice(synthesize: Synthesize, onFallback?: OnFallback, streamLink?: StreamLink)");
    expect(hook).toContain('gate().settle("stopped");');
    expect(hook).toContain("return { speak, stop, interrupt, unlock, speaking, level, lastFallback };");
  });

  it("warms speechSynthesis in unlock and watches browser speech and streams", () => {
    const unlock = hook.slice(hook.indexOf("const unlock = useCallback"), hook.indexOf("const meter = useCallback"));
    expect(unlock).toContain('new SpeechSynthesisUtterance(" ")');
    expect(unlock).toContain("warm.volume = 0;");
    expect(unlock).toContain("getVoices()");
    expect(hook).toContain("browserSpeechWatchdogMs(chunk.length)");
    expect(hook).toContain("for (const chunk of chunks)");
    expect(hook).toContain("STREAM_START_TIMEOUT_MS");
    expect(hook).toContain("el.onstalled = watchStall;");
    expect(hook).not.toContain("new AudioContext");
  });

  it("stops Jarvis before the mic starts in the dock and visitor Jarvis", () => {
    for (const [file, stop] of [
      ["src/components/app/JarvisDock.tsx", "voice.stop();"],
      ["src/components/marketing/VisitorJarvis.tsx", "jarvisVoice.stop();"],
    ] as const) {
      const source = readFileSync(file, "utf8");
      const listen = source.slice(source.indexOf("const listen = () => {"));
      const start = listen.indexOf("rec.start();");
      expect(start).toBeGreaterThan(-1);
      expect(listen.lastIndexOf(stop, start)).toBeGreaterThan(-1);
    }
  });
});
