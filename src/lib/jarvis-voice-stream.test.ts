import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { signVoiceLink, verifyVoiceLink, VOICE_LINK_TTL_MS, VOICE_STREAM_PATH } from "@/lib/jarvis-voice-token.server";
import { cappedAudioStream } from "@/lib/jarvis-voice.server";

const params = (link: string) => new URL(link, "https://revoragrowthsystems.com").searchParams;

describe("Jarvis streamed voice links", () => {
  it("speak exactly the signed text, including non-ASCII", async () => {
    const link = await signVoiceLink("key", "Hola, señor — ready.", 1_000);
    expect(link.startsWith(`${VOICE_STREAM_PATH}?p=`)).toBe(true);
    const q = params(link);
    expect(await verifyVoiceLink("key", q.get("p"), q.get("s"), 2_000)).toBe("Hola, señor — ready.");
  });

  it("reject another key, an altered text and an expired link", async () => {
    const q = params(await signVoiceLink("key", "Approve the PR.", 1_000));
    expect(await verifyVoiceLink("other", q.get("p"), q.get("s"), 2_000)).toBeNull();
    const forged = params(await signVoiceLink("key", "Something else.", 1_000)).get("p");
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
});
