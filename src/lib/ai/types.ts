/**
 * The provider-independent request and response shapes every Revora AI call
 * speaks. Adapters translate these into a provider's own wire format; the rest
 * of Revora never sees a provider payload.
 */

import type { ModelRole, ProviderName } from "@/lib/ai/config";

export type AiTextPart = { type: "text"; text: string };
export type AiImagePart = { type: "image"; dataUrl: string; mimeType: string };
export type AiVideoPart = { type: "video"; dataUrl: string; mimeType: string };
export type AiAudioPart = { type: "audio"; dataUrl: string; mimeType: string };
export type AiPart = AiTextPart | AiImagePart | AiVideoPart | AiAudioPart;

export type AiRole = "system" | "user" | "assistant";
export type AiMessage = { role: AiRole; content: string | AiPart[] };

/** Who the call is for — used for limits, telemetry and audit, never sent to a provider. */
export type AiCaller = {
  organizationId?: string | null;
  userId?: string | null;
  /** Short task label such as "site.plan" or "copy.hero". */
  task: string;
  /** Correlates every provider attempt of one logical request. */
  requestId?: string;
};

export type AiRequest = {
  messages: AiMessage[];
  /** Which model class the task needs; the router resolves the model name. */
  role?: ModelRole;
  /** Keep this call on verified free models only, even when paid AI is enabled. */
  freeOnly?: boolean;
  /** Force JSON output. */
  json?: boolean;
  maxOutputTokens?: number;
  temperature?: number;
};

export type AiUsage = { inputTokens: number | null; outputTokens: number | null };

export type AiTextResult = {
  text: string;
  provider: ProviderName;
  model: string;
  usage: AiUsage;
  fallbackUsed: boolean;
  requestId: string;
};

export type AiJsonResult = AiTextResult & { data: Record<string, unknown> };

export type AiImageResult = {
  base64: string;
  mimeType: string;
  provider: ProviderName;
  model: string;
  fallbackUsed: boolean;
  requestId: string;
};

export type AiTranscriptResult = {
  text: string;
  provider: ProviderName;
  model: string;
  fallbackUsed: boolean;
  requestId: string;
};

/** What every adapter must implement for Revora to treat it as a provider. */
export type ProviderAdapter = {
  name: ProviderName;
  chat(input: {
    apiKey: string;
    model: string;
    messages: AiMessage[];
    json: boolean;
    maxOutputTokens: number;
    temperature?: number;
    signal: AbortSignal;
  }): Promise<{ text: string; usage: AiUsage }>;
  stream(input: {
    apiKey: string;
    model: string;
    messages: AiMessage[];
    maxOutputTokens: number;
    signal: AbortSignal;
  }): Promise<ReadableStream<Uint8Array>>;
  image(input: {
    apiKey: string;
    model: string;
    prompt: string;
    /** Present when editing an existing image rather than creating one. */
    source?: { dataUrl: string; mimeType: string } | null;
    signal: AbortSignal;
  }): Promise<{ base64: string; mimeType: string }>;
  transcribe(input: {
    apiKey: string;
    model: string;
    audio: { dataUrl: string; mimeType: string; name: string };
    signal: AbortSignal;
  }): Promise<{ text: string }>;
};
