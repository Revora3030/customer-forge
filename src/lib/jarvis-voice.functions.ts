import { Buffer } from "node:buffer";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { speakableText } from "./jarvis-actions";

/**
 * ElevenLabs TTS is called only on the server. The API key is never returned
 * to the browser; the endpoint is available only to authenticated super-admins.
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
    const { assertSuperAdmin } = await import("./admin.server");
    await assertSuperAdmin(
      context.supabase as Parameters<typeof assertSuperAdmin>[0],
      String(context.userId),
    );

    const apiKey = process.env["ELEVENLABS_API_KEY"];
    if (!apiKey) throw new Error("ElevenLabs is not configured on the server. Add ELEVENLABS_API_KEY to the server runtime secrets.");
    const voiceId = process.env["ELEVENLABS_VOICE_ID"] || "JBFqnCBsd6RMkjVDRZzb";
    if (!/^[a-zA-Z0-9_-]{5,100}$/.test(voiceId)) throw new Error("The configured ElevenLabs voice ID is invalid.");

    let response: Response;
    try {
      response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_22050_32`, {
        method: "POST",
        headers: { "xi-api-key": apiKey, "content-type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify({
          text: data.text,
          model_id: "eleven_flash_v2_5",
          voice_settings: { stability: 0.48, similarity_boost: 0.78, style: 0.18, use_speaker_boost: true },
        }),
        signal: AbortSignal.timeout(18_000),
        // Cloudflare Workers reject redirect: "error"; "manual" plus the
        // response.ok check below still refuses any redirect.
        redirect: "manual",
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      console.error("[jarvis-voice] ElevenLabs request failed", error instanceof Error ? `${error.name}: ${error.message}` : "unknown");
      throw new Error(
        timedOut
          ? "ElevenLabs took too long to respond. Try a shorter reply or try again."
          : "ElevenLabs could not be reached from the server. Try again in a moment.",
      );
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 401 || response.status === 403) throw new Error("ElevenLabs rejected the server credential or voice access.");
      if (response.status === 429) throw new Error("ElevenLabs rate or credit limit reached. Check your ElevenLabs plan.");
      throw new Error(`ElevenLabs speech generation failed (HTTP ${response.status}).`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("audio/")) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("ElevenLabs returned an unexpected response instead of audio.");
    }
    if (!response.body) throw new Error("ElevenLabs returned an empty audio response.");

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 1_500_000) throw new Error("Generated voice response exceeded the safety size limit.");
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    if (total === 0) throw new Error("ElevenLabs returned empty audio.");
    const audio = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("base64");
    return { audioBase64: audio, contentType: "audio/mpeg" as const, provider: "elevenlabs" as const };
  });
