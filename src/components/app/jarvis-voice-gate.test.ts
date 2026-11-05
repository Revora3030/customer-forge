import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  browserSpeechWatchdogMs,
  classifyRecognitionError,
  createPlaybackGate,
  createSilenceSender,
  deriveTalkState,
  talkAnnouncement,
  talkButtonDisabled,
  talkButtonLabel,
  talkSupport,
  TALK_SILENCE_SEND_MS,
  TALK_UNSUPPORTED_MESSAGE,
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

describe("Talk mode voice gate (JC-29)", () => {
  /** A fake clock so silence can be tested without waiting. */
  const clock = () => {
    let now = 0;
    let next = 1;
    const jobs = new Map<number, { at: number; run: () => void }>();
    return {
      timers: {
        set: (run: () => void, ms: number) => { const id = next++; jobs.set(id, { at: now + ms, run }); return id; },
        clear: (id: unknown) => { jobs.delete(id as number); },
      },
      advance(ms: number) {
        now += ms;
        for (const [id, job] of [...jobs]) if (job.at <= now) { jobs.delete(id); job.run(); }
      },
      pending: () => jobs.size,
    };
  };

  it("sends what was heard once, after the owner has been quiet", () => {
    const fake = clock();
    const sent: string[] = [];
    const sender = createSilenceSender((words) => sent.push(words), TALK_SILENCE_SEND_MS, fake.timers);
    sender.hear("book me");
    fake.advance(TALK_SILENCE_SEND_MS - 1);
    expect(sent).toEqual([]);
    fake.advance(1);
    expect(sent).toEqual(["book me"]);
    expect(sender.sent()).toBe(true);
    sender.hear("and more");
    fake.advance(10_000);
    expect(sent).toEqual(["book me"]);
  });

  it("more speech restarts the silence countdown and sends the latest words", () => {
    const fake = clock();
    const sent: string[] = [];
    const sender = createSilenceSender((words) => sent.push(words), 1000, fake.timers);
    sender.hear("what is");
    fake.advance(900);
    sender.hear("what is my schedule");
    fake.advance(900);
    expect(sent).toEqual([]);
    fake.advance(100);
    expect(sent).toEqual(["what is my schedule"]);
  });

  it("cancel drops the words and re-arms the sender; blank speech never sends", () => {
    const fake = clock();
    const sent: string[] = [];
    const sender = createSilenceSender((words) => sent.push(words), 1000, fake.timers);
    sender.hear("   ");
    expect(fake.pending()).toBe(0);
    sender.hear("hello");
    sender.cancel();
    expect(fake.pending()).toBe(0);
    fake.advance(5000);
    expect(sent).toEqual([]);
    sender.hear("again");
    fake.advance(1000);
    expect(sent).toEqual(["again"]);
  });

  it("falls back to text with a clear message when the browser has no speech recognition", () => {
    expect(talkSupport({})).toEqual({ supported: false, message: TALK_UNSUPPORTED_MESSAGE });
    expect(TALK_UNSUPPORTED_MESSAGE).toMatch(/Type your message instead/);
    expect(talkSupport({ webkitSpeechRecognition: function Fake() {} })).toEqual({ supported: true });
    expect(talkSupport({ SpeechRecognition: function Fake() {} })).toEqual({ supported: true });
  });

  it("stops Talk instead of looping when the mic is blocked, missing or offline; silence is routine", () => {
    expect(classifyRecognitionError("no-speech")).toEqual({ fatal: false, message: null });
    expect(classifyRecognitionError("aborted")).toEqual({ fatal: false, message: null });
    for (const code of ["not-allowed", "service-not-allowed", "audio-capture", "network", "language-not-supported", "something-new", undefined]) {
      const failure = classifyRecognitionError(code);
      expect(failure.fatal, String(code)).toBe(true);
      expect(failure.message, String(code)).toMatch(/type|Type/);
    }
  });

  it("derives one mic state: speaking beats listening beats thinking", () => {
    expect(deriveTalkState({ speaking: true, listening: true, busy: true })).toBe("speaking");
    expect(deriveTalkState({ speaking: false, listening: true, busy: true })).toBe("listening");
    expect(deriveTalkState({ speaking: false, listening: false, busy: true })).toBe("thinking");
    expect(deriveTalkState({ speaking: false, listening: false, busy: false })).toBe("idle");
  });

  it("announces each state while Talk is on, and nothing while it is off", () => {
    expect(talkAnnouncement("listening", true)).toBe("Jarvis is listening.");
    expect(talkAnnouncement("thinking", true)).toBe("Jarvis is thinking.");
    expect(talkAnnouncement("speaking", true)).toMatch(/^Jarvis is speaking\./);
    expect(talkAnnouncement("idle", true)).toMatch(/Talk mode is on/);
    for (const state of ["idle", "listening", "thinking", "speaking"] as const) expect(talkAnnouncement(state, false)).toBe("");
  });

  it("barge-in: while Jarvis speaks the Talk button is live and says it will interrupt", () => {
    expect(talkButtonLabel("speaking")).toBe("Interrupt and talk");
    expect(talkButtonDisabled("speaking")).toBe(false);
    expect(talkButtonDisabled("idle")).toBe(false);
    expect(talkButtonDisabled("listening")).toBe(true);
    expect(talkButtonDisabled("thinking")).toBe(true);
    expect(talkButtonLabel("idle")).toBe("Tap to talk");
  });
});

describe("Talk mode wiring (JC-29/JC-30)", () => {
  const route = readFileSync("src/routes/_authenticated/admin.jarvis.tsx", "utf8");
  const voiceGate = readFileSync("src/components/app/jarvis-voice-gate.ts", "utf8");

  it("uses only free browser speech: no paid speech provider is switched on by Talk", () => {
    const talk = route.slice(route.indexOf("const toggleLive = () => {"), route.indexOf("/** Tap to talk"));
    expect(talk).toContain("talkSupport()");
    expect(talk).not.toMatch(/elevenlabs|lovable|chooseVoiceProvider|setVoiceProvider/i);
    expect(voiceGate).not.toMatch(/fetch\(|elevenlabs\.io|api\.openai/i);
    expect(route).toContain('useState<JarvisVoiceProvider>("auto")');
  });

  it("refuses to start Talk without speech recognition and says why", () => {
    const talk = route.slice(route.indexOf("const toggleLive = () => {"), route.indexOf("/** Tap to talk"));
    expect(talk.indexOf("if (!support.supported) { setTalkNotice(support.message); return; }")).toBeGreaterThan(-1);
    expect(talk.indexOf("support.supported")).toBeLessThan(talk.indexOf("liveRef.current = next;"));
  });

  it("sends on silence, ends Talk on a fatal mic error, and stops speech before the mic opens", () => {
    const listen = route.slice(route.indexOf("function listen("), route.indexOf("function endLive()"));
    expect(listen).toContain("createSilenceSender((words) => commit(words))");
    expect(listen).toContain("quiet?.hear(lastInterim)");
    expect(listen).toContain("classifyRecognitionError(event?.error)");
    expect(listen).toContain("if (failure.fatal)");
    expect(listen.indexOf("stopVoice();")).toBeLessThan(listen.indexOf("rec.start()"));
    expect(route).toContain('event.key === "Escape"');
  });

  it("mounts one status live region and the Live panel no longer announces on its own", () => {
    const status = readFileSync("src/components/app/jarvis/JarvisTalkStatus.tsx", "utf8");
    const live = readFileSync("src/components/app/jarvis/LiveSurface.tsx", "utf8");
    expect(status.match(/aria-live=/g)).toHaveLength(1);
    expect(status).toContain('role="status"');
    expect(status).toContain('aria-atomic="true"');
    expect(live).not.toContain("aria-live");
    expect(route).toContain("<JarvisTalkStatus");
  });

  it("keeps every voice control at 44px and out of the sub-12px / window.confirm contract", () => {
    for (const file of ["JarvisTalkStatus", "LiveSurface", "JarvisHeader", "JarvisComposer"]) {
      const source = readFileSync(`src/components/app/jarvis/${file}.tsx`, "utf8");
      expect(source).not.toContain("window.confirm");
      expect(source).not.toMatch(/text-\[(?:8|9|10|11)(?:\.5)?px\]/);
    }
    const header = readFileSync("src/components/app/jarvis/JarvisHeader.tsx", "utf8");
    const composer = readFileSync("src/components/app/jarvis/JarvisComposer.tsx", "utf8");
    const live = readFileSync("src/components/app/jarvis/LiveSurface.tsx", "utf8");
    expect(header).toContain("h-11 min-w-11 shrink-0 gap-1.5 rounded-full px-3 text-sm ${live");
    expect(header).toContain("relative z-30 size-11 shrink-0");
    expect(header).toContain('aria-label="Stop speaking" onClick={onStopSpeaking} className="h-11 min-w-11');
    expect(composer).toContain("`size-11 shrink-0 rounded-full ${listening");
    expect(live).toContain("h-12 min-h-11 flex-1");
    expect(live).toContain("min-h-11 min-w-11 shrink-0 px-3");
  });
});
