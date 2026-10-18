import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { signVoiceLink, verifyVoiceLink, VOICE_LINK_TTL_MS, VOICE_STREAM_PATH } from "@/lib/jarvis-voice-token.server";
import { cappedAudioStream, describeElevenLabsFailure } from "@/lib/jarvis-voice.server";

const params = (link: string) => new URL(link, "https://revoragrowthsystems.com").searchParams;

describe("Jarvis streamed voice links", () => {
  it("speak exactly the signed text, including non-ASCII", async () => {
    const link = await signVoiceLink("key", "Hola, señor — ready.", "admin", 1_000);
    expect(link.startsWith(`${VOICE_STREAM_PATH}?p=`)).toBe(true);
    const q = params(link);
    expect((await verifyVoiceLink("key", q.get("p"), q.get("s"), 2_000))?.text).toBe("Hola, señor — ready.");
  });

  it("round-trips a fresh nonce and the budget scope", async () => {
    const a = await verifyVoiceLink("key", ...pair(await signVoiceLink("key", "Same text.", "visitor", 1_000)), 2_000);
    const b = await verifyVoiceLink("key", ...pair(await signVoiceLink("key", "Same text.", "admin", 1_000)), 2_000);
    expect(a?.scope).toBe("visitor");
    expect(b?.scope).toBe("admin");
    expect(a?.nonce).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(a?.nonce).not.toBe(b?.nonce);
    expect(a?.expiresAt).toBe(1_000 + VOICE_LINK_TTL_MS);
  });

  it("reject another key, an altered text, an expired link and a link without a nonce", async () => {
    const q = params(await signVoiceLink("key", "Approve the PR.", "admin", 1_000));
    expect(await verifyVoiceLink("other", q.get("p"), q.get("s"), 2_000)).toBeNull();
    const forged = params(await signVoiceLink("key", "Something else.", "admin", 1_000)).get("p");
    expect(await verifyVoiceLink("key", forged, q.get("s"), 2_000)).toBeNull();
    expect(await verifyVoiceLink("key", q.get("p"), q.get("s"), 1_000 + VOICE_LINK_TTL_MS + 1)).toBeNull();
    expect(await verifyVoiceLink("key", null, null)).toBeNull();
  });

  it("stops a stream that grows past the size limit", async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8));
        controller.enqueue(new Uint8Array(8));
        controller.close();
      },
    });
    await expect(new Response(cappedAudioStream(source, 10)).arrayBuffer()).rejects.toThrow(/size limit/);
  });

  it("streams from ElevenLabs without following redirects", () => {
    const server = readFileSync("src/lib/jarvis-voice.server.ts", "utf8");
    expect(server).toContain('redirect: "manual"');
    expect(server).toContain('options.stream ? "/stream" : ""');
    expect(readFileSync("src/routes/api/public/jarvis-voice.ts", "utf8")).toContain("verifyVoiceLink");
  });

  it("maps a 3xx to an explicit redirect refusal, not a generic HTTP code", () => {
    expect(describeElevenLabsFailure(302, "")).toEqual({ code: "redirect_refused", message: expect.stringContaining("redirect refused") });
    expect(describeElevenLabsFailure(307, "<html>moved</html>").code).toBe("redirect_refused");
  });

  it("claims the link and reserves the budget before calling ElevenLabs", () => {
    const route = readFileSync("src/routes/api/public/jarvis-voice.ts", "utf8");
    const claim = route.indexOf("await claimVoiceLink(");
    const reserve = route.indexOf("await reserveVoiceChars(");
    const speech = route.indexOf("await requestElevenLabsSpeech(");
    expect(claim).toBeGreaterThan(-1);
    expect(reserve).toBeGreaterThan(claim);
    expect(speech).toBeGreaterThan(reserve);
    expect(route).toContain('"accept-ranges": "none"');
    expect(route).toContain("fail(429");
    const fns = readFileSync("src/lib/jarvis-voice.functions.ts", "utf8");
    const synth = fns.slice(fns.indexOf("export const synthesizeJarvisVoice"), fns.indexOf("export const jarvisVoiceLinks"));
    expect(synth.indexOf('reserveVoiceChars("admin"')).toBeGreaterThan(-1);
    expect(synth.indexOf('reserveVoiceChars("admin"')).toBeLessThan(synth.indexOf("await requestElevenLabsSpeech("));
  });

  it("signs every link with the one trimmed key from voiceConfig()", () => {
    const server = readFileSync("src/lib/jarvis-voice.server.ts", "utf8");
    expect(server).toContain('process.env["ELEVENLABS_API_KEY"]?.trim()');
    expect(server).toContain('process.env["ELEVENLABS_VOICE_ID"]?.trim()');
    const visitor = readFileSync("src/lib/visitor-jarvis.functions.ts", "utf8");
    expect(visitor).toContain("voiceConfig().apiKey");
    expect(visitor).not.toContain('process.env["ELEVENLABS_API_KEY"]');
  });
});

function pair(link: string): [string | null, string | null] {
  const q = params(link);
  return [q.get("p"), q.get("s")];
}
