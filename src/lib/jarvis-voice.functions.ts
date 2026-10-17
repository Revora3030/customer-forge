import { Buffer } from "node:buffer";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { speakableText } from "./jarvis-actions";

const assertAdmin = async (context: { supabase: unknown; userId: unknown }) => {
  const { assertSuperAdmin } = await import("./admin.server");
  await assertSuperAdmin(context.supabase as Parameters<typeof assertSuperAdmin>[0], String(context.userId));
};

/**
 * ElevenLabs TTS is called only on the server. The API key is never returned
 * to the browser; the endpoint is available only to authenticated super-admins.
 * This buffered version is the fallback when a streamed link can't play.
 */
export const synthesizeJarvisVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { text: string }) => {
    if (typeof input?.text !== "string") throw new Error("Enter text for Jarvis to speak.");
    const text = speakableText(input.text);
    if (!text) throw new Error("There is no readable text to speak.");
    return { text };
  })
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { requestElevenLabsSpeech, VOICE_MAX_BYTES } = await import("./jarvis-voice.server");
    const response = await requestElevenLabsSpeech(data.text, { stream: false });

    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > VOICE_MAX_BYTES) throw new Error("Generated voice response exceeded the safety size limit.");
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    if (total === 0) throw new Error("ElevenLabs returned empty audio.");
    const audio = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("base64");
    return { audioBase64: audio, contentType: "audio/mpeg" as const, provider: "elevenlabs" as const };
  });

/**
 * One signed, two-minute streaming link per sentence, minted in a single call.
 * The audio element plays each link while ElevenLabs is still generating it,
 * so Jarvis starts talking after the first words instead of the whole sentence.
 */
export const jarvisVoiceLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { texts: string[] }) => {
    if (!Array.isArray(input?.texts) || input.texts.length === 0 || input.texts.length > 40) {
      throw new Error("Send between 1 and 40 sentences to speak.");
    }
    const texts = input.texts.map((text) => (typeof text === "string" ? speakableText(text) : ""));
    if (texts.some((text) => !text)) throw new Error("There is no readable text to speak.");
    return { texts };
  })
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { voiceConfig } = await import("./jarvis-voice.server");
    const { signVoiceLink } = await import("./jarvis-voice-token.server");
    const { apiKey } = voiceConfig();
    return { urls: await Promise.all(data.texts.map((text) => signVoiceLink(apiKey, text))) };
  });

export type JarvisVoiceStatus =
  | { connected: true; voiceId: string; voiceName: string; customVoice: boolean }
  | { connected: false; reason: string };

/**
 * Is Jarvis really speaking in the owner's ElevenLabs voice? Looks the voice
 * up with the server's key (no speech is generated, so it costs nothing) and
 * says plainly what's missing when it isn't.
 */
export const jarvisVoiceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<JarvisVoiceStatus> => {
    await assertAdmin(context);
    const apiKey = process.env["ELEVENLABS_API_KEY"];
    if (!apiKey) return { connected: false, reason: "ELEVENLABS_API_KEY isn't set in the server secrets, so Jarvis uses the browser voice." };
    const configured = process.env["ELEVENLABS_VOICE_ID"]?.trim() ?? "";
    const { voiceConfig } = await import("./jarvis-voice.server");
    let voiceId: string;
    try {
      voiceId = voiceConfig().voiceId;
    } catch (error) {
      return { connected: false, reason: error instanceof Error ? error.message : "The voice settings are invalid." };
    }
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, {
        headers: { "xi-api-key": apiKey, accept: "application/json" },
        signal: AbortSignal.timeout(8000),
        redirect: "manual",
      });
      if (response.status === 401) return { connected: false, reason: "ElevenLabs rejected the API key. Check ELEVENLABS_API_KEY." };
      if (response.status === 404 || response.status === 400)
        return { connected: false, reason: `ElevenLabs has no voice ${voiceId} on this account. Set ELEVENLABS_VOICE_ID to your voice's ID.` };
      if (!response.ok) return { connected: false, reason: `ElevenLabs answered ${response.status}. Try again shortly.` };
      const voice = (await response.json()) as { name?: unknown };
      return {
        connected: true,
        voiceId,
        voiceName: typeof voice.name === "string" ? voice.name : voiceId,
        customVoice: Boolean(configured),
      };
    } catch {
      return { connected: false, reason: "Couldn't reach ElevenLabs just now." };
    }
  });
