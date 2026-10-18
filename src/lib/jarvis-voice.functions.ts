import { Buffer } from "node:buffer";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { speakableText } from "./jarvis-actions";

const assertAdmin = async (context: { supabase: unknown; userId: unknown }) => {
  const { assertSuperAdmin } = await import("./admin.server");
  await assertSuperAdmin(context.supabase as Parameters<typeof assertSuperAdmin>[0], String(context.userId));
};

const ADMIN_BUDGET_REFUSED = "Today's ElevenLabs voice budget for Jarvis is used up (ELEVENLABS_ADMIN_DAILY_CHARS).";

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
    const { requestElevenLabsSpeech, readAudio } = await import("./jarvis-voice.server");
    const { reserveVoiceChars } = await import("./jarvis-voice-budget.server");
    if (!(await reserveVoiceChars("admin", data.text.length)).allowed) throw new Error(ADMIN_BUDGET_REFUSED);
    const response = await requestElevenLabsSpeech(data.text, { stream: false });
    const chunks = await readAudio(response);
    if (!chunks.length) throw new Error("ElevenLabs returned empty audio.");
    const audio = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("base64");
    return { audioBase64: audio, contentType: "audio/mpeg" as const, provider: "elevenlabs" as const };
  });

/**
 * One signed, two-minute streaming link per sentence, minted in a single call.
 * The audio element plays each link while ElevenLabs is still generating it,
 * so Jarvis starts talking after the first words instead of the whole sentence.
 * The stream route spends the 'admin' daily budget when a link is played.
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
    return { urls: await Promise.all(data.texts.map((text) => signVoiceLink(apiKey, text, "admin"))) };
  });

export type JarvisVoiceStatus =
  | { connected: true; voiceId: string; voiceName: string; customVoice: boolean }
  | { connected: false; reason: string; code?: string };

/**
 * Can the server's key see the configured voice? Looks the voice up (no
 * speech is generated, so it costs nothing) and says plainly what's missing
 * when it can't. This does not prove speech works (quota, plan and tier only
 * show on a real generation): testJarvisVoice does that, on a click.
 */
export const jarvisVoiceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<JarvisVoiceStatus> => {
    await assertAdmin(context);
    const configured = process.env["ELEVENLABS_VOICE_ID"]?.trim() ?? "";
    const { voiceConfig, describeElevenLabsFailure, readErrorBody } = await import("./jarvis-voice.server");
    if (!process.env["ELEVENLABS_API_KEY"]?.trim())
      return { connected: false, code: "not_configured", reason: "ELEVENLABS_API_KEY isn't set in the server secrets, so Jarvis uses the browser voice." };
    let apiKey: string;
    let voiceId: string;
    try {
      ({ apiKey, voiceId } = voiceConfig());
    } catch (error) {
      return { connected: false, code: "invalid_config", reason: error instanceof Error ? error.message : "The voice settings are invalid." };
    }
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, {
        headers: { "xi-api-key": apiKey, accept: "application/json" },
        signal: AbortSignal.timeout(8000),
        redirect: "manual",
      });
      if (!response.ok) {
        const failure = describeElevenLabsFailure(response.status, await readErrorBody(response));
        if (failure.code === "missing_permissions")
          return { connected: false, code: failure.code, reason: "The ElevenLabs key can't list voices; speech may still work. Use Test voice to check." };
        if (response.status === 404 || response.status === 400 || failure.code === "voice_not_found")
          return { connected: false, code: "voice_not_found", reason: `ElevenLabs has no voice ${voiceId} on this account. Set ELEVENLABS_VOICE_ID to your voice's ID.` };
        return { connected: false, code: failure.code, reason: failure.message };
      }
      const voice = (await response.json()) as { name?: unknown };
      return {
        connected: true,
        voiceId,
        voiceName: typeof voice.name === "string" ? voice.name : voiceId,
        customVoice: Boolean(configured),
      };
    } catch {
      return { connected: false, code: "unreachable", reason: "Couldn't reach ElevenLabs just now." };
    }
  });

export type JarvisVoiceTest = { ok: true; ms: number; bytes: number } | { ok: false; code: string; reason: string };

const TEST_PHRASE = "Jarvis voice check.";

/**
 * A real, end-to-end ElevenLabs generation of a short phrase: the only check
 * that proves quota, plan and key permissions allow speech. It spends a few
 * characters, so it is super-admin only and runs only when the owner clicks
 * Test voice (never on mount or a poll).
 */
export const testJarvisVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<JarvisVoiceTest> => {
    await assertAdmin(context);
    const { requestElevenLabsSpeech, readAudio, ElevenLabsError } = await import("./jarvis-voice.server");
    const { reserveVoiceChars } = await import("./jarvis-voice-budget.server");
    if (!process.env["ELEVENLABS_API_KEY"]?.trim())
      return { ok: false, code: "not_configured", reason: "ELEVENLABS_API_KEY isn't set in the server secrets." };
    if (!(await reserveVoiceChars("admin", TEST_PHRASE.length)).allowed) return { ok: false, code: "budget_exhausted", reason: ADMIN_BUDGET_REFUSED };
    const started = Date.now();
    try {
      const response = await requestElevenLabsSpeech(TEST_PHRASE, { stream: false });
      const chunks = await readAudio(response, 200_000);
      const bytes = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      if (!bytes) return { ok: false, code: "bad_response", reason: "ElevenLabs returned empty audio." };
      return { ok: true, ms: Date.now() - started, bytes };
    } catch (error) {
      if (error instanceof ElevenLabsError) return { ok: false, code: error.code, reason: error.message };
      return { ok: false, code: "failed", reason: error instanceof Error ? error.message : "The voice check failed." };
    }
  });
