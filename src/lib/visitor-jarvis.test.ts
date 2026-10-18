import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseVisitorReply, visitorSpokenText } from "@/lib/visitor-jarvis";
import { splitSpeech } from "@/lib/speech-chunks";
import { signVoiceLink, verifyVoiceLink } from "@/lib/jarvis-voice-token.server";
import { visitorSystemPrompt } from "@/lib/visitor-jarvis.functions";

describe("Jarvis for visitors", () => {
  it("separates the reply from one next-step action and strips markup", () => {
    expect(parseVisitorReply("You can bring your current site.\n[[upgrade]]")).toEqual({ reply: "You can bring your current site.", action: "upgrade" });
    expect(parseVisitorReply("Sure <b>thing</b> [[pricing]] [[start]]").action).toBe("pricing");
    expect(parseVisitorReply("Hi <scr<script>ipt>alert(1)").reply).not.toMatch(/[<>]/);
    expect(parseVisitorReply("[[delete everything]]")).toEqual({ reply: "Happy to help. What kind of business do you run?", action: null });
  });

  it("states the real offer and forbids invented claims", () => {
    const prompt = visitorSystemPrompt("/pricing");
    expect(prompt).toContain("$350.00 one-time setup");
    expect(prompt).toContain("$100.00/month");
    expect(prompt).toContain("never invent features");
    expect(prompt).toContain("Never ask for passwords or card details");
  });

  it("runs on free models only, rate-limited, and is mounted on every marketing page", () => {
    const fns = readFileSync("src/lib/visitor-jarvis.functions.ts", "utf8");
    expect(fns).toContain("freeOnly: true");
    expect(fns).toContain("if (!allow(visitorKey()))");
    expect(readFileSync("src/components/marketing/Chrome.tsx", "utf8")).toContain("<VisitorJarvis />");
  });
});

describe("visitor Jarvis speaks in the ElevenLabs voice", () => {
  it("signs links only for its own reply, under an hourly allowance, and falls back to the browser voice", () => {
    const fns = readFileSync("src/lib/visitor-jarvis.functions.ts", "utf8");
    expect(fns).toContain("const voice = data.voice ? await replyVoice(parsed.reply).catch(() => undefined) : undefined;");
    expect(fns).toContain("const VOICE_CHARS_PER_HOUR = 30_000;");
    expect(fns).toContain('if (!apiKey) return undefined;');
    const widget = readFileSync("src/components/marketing/VisitorJarvis.tsx", "utf8");
    expect(widget).toContain("useJarvisVoice(synthesize, undefined, streamLink)");
    expect(widget).toContain("jarvisVoice.unlock();");
  });

  it("signs a link for every chunk the browser will speak, for replies with URLs, emails, dashes and long text", async () => {
    const replies = [
      "You can see every plan at https://revoragrowthsystems.com/pricing and start today. Questions? Ask away.",
      "Email hello@revoragrowthsystems.com or visit www.revoragrowthsystems.com/audit for a free audit.",
      "Setup is one fee — then the first month is free — and you can cancel anytime.",
      `${"Revora builds your site, books jobs and follows up on every lead for you. ".repeat(14)}See https://example.com/x.`,
    ];
    for (const reply of replies) {
      const text = visitorSpokenText(reply);
      expect(text.length).toBeLessThanOrEqual(700);
      expect(text).not.toMatch(/https?:\/\/|www\./);
      // What replyVoice() signs: one link per splitSpeech chunk of visitorSpokenText(reply).
      const links: Record<string, string> = {};
      for (const chunk of splitSpeech(text)) links[chunk] = await signVoiceLink("key", chunk, "visitor");
      // What the browser speaks: voice.text verbatim, chunked the same way by the hook.
      const spoken = splitSpeech(text);
      expect(spoken.length).toBeGreaterThan(0);
      for (const chunk of spoken) {
        expect(links[chunk]).toBeDefined();
        const q = new URL(links[chunk]!, "https://revoragrowthsystems.com").searchParams;
        expect((await verifyVoiceLink("key", q.get("p"), q.get("s")))?.text).toBe(chunk);
      }
    }
    const fns = readFileSync("src/lib/visitor-jarvis.functions.ts", "utf8");
    expect(fns).toContain("const text = visitorSpokenText(reply);");
    expect(fns).toContain("const chunks = splitSpeech(text);");
    expect(fns).toContain('signVoiceLink(apiKey, chunk, "visitor")');
    const widget = readFileSync("src/components/marketing/VisitorJarvis.tsx", "utf8");
    expect(widget).not.toContain(".replace(/https?:");
    expect(widget).toContain("jarvisVoice.speak(voice ? voice.text : visitorSpokenText(content))");
  });

  it("lets the owner see whether their own ElevenLabs voice is connected", () => {
    const voice = readFileSync("src/lib/jarvis-voice.functions.ts", "utf8");
    expect(voice).toContain("https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}");
    expect(voice).toContain("await assertAdmin(context);");
    expect(readFileSync("src/components/app/JarvisDock.tsx", "utf8")).toContain("Voice: ElevenLabs · ");
  });
});
