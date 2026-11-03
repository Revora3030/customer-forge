import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  countSpokenWords,
  parseVoiceFlag,
  VOICE_BREVITY_RULE,
  VOICE_REPLY_MAX_WORDS,
  voiceBrevityLines,
} from "./jarvis-voice-brevity";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("Jarvis voice brevity rule", () => {
  it("caps spoken replies at 25 words and asks for plain spoken sentences", () => {
    expect(VOICE_REPLY_MAX_WORDS).toBe(25);
    expect(VOICE_BREVITY_RULE).toContain("25 words or fewer");
    expect(VOICE_BREVITY_RULE).toMatch(/no lists, tables, links, URLs or markdown/);
    expect(VOICE_BREVITY_RULE).toMatch(/details in chat/i);
  });

  it("adds the rule only on voice turns", () => {
    expect(voiceBrevityLines(true)).toEqual([VOICE_BREVITY_RULE]);
    expect(voiceBrevityLines(false)).toEqual([]);
  });

  it("treats only an explicit true as a voice turn", () => {
    expect(parseVoiceFlag(true)).toBe(true);
    for (const value of [undefined, null, "true", 1, {}, false]) expect(parseVoiceFlag(value)).toBe(false);
  });

  it("counts words the way a listener hears them", () => {
    expect(countSpokenWords("")).toBe(0);
    expect(countSpokenWords("  Three leads came in today.  ")).toBe(5);
  });
});

describe("voice turns are wired end to end", () => {
  it("sendJarvisMessage parses the flag and runJarvis injects the rule into the system prompt", () => {
    const src = read("./jarvis.functions.ts");
    expect(src).toContain("voice: parseVoiceFlag(input.voice)");
    expect(src).toContain("data.model, data.voice)");
    expect(src).toMatch(/MODE_CONFIG\[mode\]\.rule,\s*\n\s*\.\.\.voiceBrevityLines\(voice\),/);
  });

  it("the Jarvis page and dock mark a turn as voice when the reply will be read aloud", () => {
    expect(read("../routes/_authenticated/admin.jarvis.tsx")).toContain("voice: voice || liveRef.current");
    expect(read("../components/app/JarvisDock.tsx")).toContain("voice: prefs.voice");
  });

  it("keeps the TTS ladder: Gateway speech falls back to browser speechSynthesis, with no Kokoro or Piper", () => {
    const hook = read("../components/app/use-jarvis-voice.ts");
    expect(hook).toContain("window.speechSynthesis.speak(utterance)");
    expect(hook).toContain("browserVoice(");
    const pkg = read("../../package.json").toLowerCase();
    expect(pkg).not.toMatch(/kokoro|piper/);
  });
});
