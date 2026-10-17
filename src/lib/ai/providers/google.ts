/**
 * Google Gemini adapter — Revora's own Google AI key, called directly.
 *
 * Text and multimodal work go through Gemini's `generateContent` API, image
 * work through the same API with an image response modality, and transcription
 * by asking a Gemini model to transcribe inline audio verbatim. No proxy sits
 * between Revora and Google.
 */

import type { AiMessage, AiPart, AiUsage, ProviderAdapter } from "@/lib/ai/types";
import { RevoraAiError } from "@/lib/ai/errors";
import { base64FromDataUrl, providerHttpError } from "@/lib/ai/providers/shared";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

function partsOf(content: string | AiPart[]): GeminiPart[] {
  if (typeof content === "string") return [{ text: content }];
  return content.map((part) =>
    part.type === "text"
      ? { text: part.text }
      : { inline_data: { mime_type: part.mimeType, data: base64FromDataUrl(part.dataUrl) } },
  );
}

/** Gemini takes system text separately and only knows "user" and "model" turns. */
function toGemini(messages: AiMessage[]) {
  const system: GeminiPart[] = [];
  const contents: { role: "user" | "model"; parts: GeminiPart[] }[] = [];
  for (const message of messages) {
    if (message.role === "system") {
      system.push(...partsOf(message.content));
      continue;
    }
    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: partsOf(message.content),
    });
  }
  return { system, contents };
}

function usageOf(payload: unknown): AiUsage {
  const meta = (payload as { usageMetadata?: Record<string, number> } | null)?.usageMetadata;
  return {
    inputTokens: typeof meta?.["promptTokenCount"] === "number" ? meta["promptTokenCount"] : null,
    outputTokens:
      typeof meta?.["candidatesTokenCount"] === "number" ? meta["candidatesTokenCount"] : null,
  };
}

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string; inlineData?: { data?: string; mimeType?: string } }[] };
  }[];
};

function textOf(payload: GeminiResponse) {
  return (payload.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

async function generate(
  apiKey: string,
  model: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
) {
  const response = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw await providerHttpError("google", response);
  return (await response.json()) as GeminiResponse;
}

export const googleAdapter: ProviderAdapter = {
  name: "google",

  async chat({ apiKey, model, messages, json, maxOutputTokens, temperature, signal }) {
    const { system, contents } = toGemini(messages);
    const payload = await generate(
      apiKey,
      model,
      {
        contents,
        ...(system.length ? { systemInstruction: { parts: system } } : {}),
        generationConfig: {
          maxOutputTokens,
          ...(typeof temperature === "number" ? { temperature } : {}),
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      },
      signal,
    );
    const text = textOf(payload);
    // Thinking can spend the whole output budget, and a safety block returns no
    // parts: either way an empty answer must hand off to the next model.
    if (!text.trim())
      throw new RevoraAiError(502, "Revora's Google model returned nothing.", { category: "bad_response", provider: "google" });
    return { text, usage: usageOf(payload) };
  },

  async stream({ apiKey, model, messages, maxOutputTokens, signal }) {
    const { system, contents } = toGemini(messages);
    const response = await fetch(
      `${BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents,
          ...(system.length ? { systemInstruction: { parts: system } } : {}),
          generationConfig: { maxOutputTokens },
        }),
        signal,
      },
    );
    if (!response.ok) throw await providerHttpError("google", response);
    if (!response.body) throw new RevoraAiError(502, "Revora AI returned an empty stream.");
    return response.body;
  },

  async image({ apiKey, model, prompt, source, signal }) {
    const parts: GeminiPart[] = [{ text: prompt }];
    if (source)
      parts.push({
        inline_data: { mime_type: source.mimeType, data: base64FromDataUrl(source.dataUrl) },
      });
    const payload = await generate(
      apiKey,
      model,
      { contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["IMAGE"] } },
      signal,
    );
    const inline = (payload.candidates?.[0]?.content?.parts ?? []).find((part) => part.inlineData);
    const base64 = inline?.inlineData?.data;
    if (!base64)
      throw new RevoraAiError(502, "Revora AI returned no image. Try again.", {
        category: "bad_response",
        provider: "google",
      });
    return { base64, mimeType: inline?.inlineData?.mimeType ?? "image/png" };
  },

  async transcribe({ apiKey, model, audio, signal }) {
    const payload = await generate(
      apiKey,
      model,
      {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Transcribe this recording verbatim. Reply with the spoken words only — no commentary, labels or timestamps.",
              },
              {
                inline_data: {
                  mime_type: audio.mimeType,
                  data: base64FromDataUrl(audio.dataUrl),
                },
              },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 2048 },
      },
      signal,
    );
    return { text: textOf(payload) };
  },
};
