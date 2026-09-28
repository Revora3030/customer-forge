/**
 * The one place Revora decides which AI provider and model runs a task.
 *
 * Everything is read from server-side environment variables at call time.
 * No provider URL, model name, key or limit is written anywhere else in the
 * codebase, so swapping providers is a configuration change (or one new
 * adapter) rather than a rewrite.
 *
 * Server-only. Never import this from a component: `process.env` is not
 * available in the browser and these names must never reach a client bundle.
 */

import { notConfigured } from "@/lib/ai/errors";

/**
 * Every provider Revora can address. `cloudflare` and `openrouter` exist only
 * as free providers (see `src/lib/ai/free.ts`); the paid chain below can still
 * only ever contain `google` or `openai`, and only when an operator has
 * explicitly opted out of free-only mode.
 */
export type ProviderName =
  | "google"
  | "openai"
  | "cloudflare"
  | "openrouter"
  | "groq"
  | "nvidia"
  | "llm7";

/** Providers that bill Revora per call. */
export type PaidProviderName = "google" | "openai";

/** The kinds of work Revora routes; each maps to a model per provider. */
/**
 * `design` is the creative-judgement role: palette, backdrop, section mix and
 * page order. It is deliberately separate from `primary` so the strongest
 * available model can be pointed at look-and-feel decisions while cheap models
 * keep doing the short, mechanical work.
 */
export type ModelRole =
  | "primary"
  | "design"
  | "fast"
  | "vision"
  | "coding"
  | "image"
  | "transcription"
  /**
   * `conversation` is the client-facing role: reading what the owner asked for,
   * intake questions and clarifying replies. Astra owns it so Sol is never
   * spent on conversation and never loses creative authority to it.
   */
  | "conversation";

export type ProviderConfig = {
  name: ProviderName;
  apiKey: string;
  models: Record<ModelRole, string>;
};

/**
 * Model defaults per provider. Each can be overridden by environment variable
 * (`AI_GOOGLE_MODEL_PRIMARY`, `AI_OPENAI_MODEL_FAST`, …) so a model change
 * never requires a deploy of new code.
 */
const DEFAULT_MODELS: Record<PaidProviderName, Record<ModelRole, string>> = {
  google: {
    // Verified live against Google on 2026-09-26. The retired gemini-2.5-pro
    // and gemini-2.5-flash ids now return 404, so every role points at a model
    // that actually answers.
    primary: "gemini-3.8-flash",
    design: "gemini-3.8-flash",
    fast: "gemini-3.5-flash-lite",
    vision: "gemini-3.8-flash",
    coding: "gemini-3.8-flash",
    image: "gemini-3.1-flash-image",
    transcription: "gemini-3.5-transcribe",
    conversation: "gemini-3.8-flash",
  },
  openai: {
    primary: "gpt-5.6-terra",
    design: "gpt-6-sol",
    fast: "gpt-5.4-mini",
    vision: "gpt-5.6-terra",
    coding: "gpt-6-sol",
    image: "gpt-image-2.5-sunburst",
    transcription: "gpt-transcribe",
    conversation: "gpt-6-astra",
  },
};

const KEY_ENV: Record<PaidProviderName, string> = {
  google: "GOOGLE_AI_API_KEY",
  openai: "OPENAI_API_KEY",
};

const ROLES: ModelRole[] = [
  "primary",
  "design",
  "fast",
  "vision",
  "coding",
  "image",
  "transcription",
  "conversation",
];


function env(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberEnv(name: string, fallback: number) {
  const raw = env(name);
  const parsed = raw === null ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function modelsFor(provider: PaidProviderName): Record<ModelRole, string> {
  const upper = provider.toUpperCase();
  const defaults = DEFAULT_MODELS[provider];
  const models = {} as Record<ModelRole, string>;
  for (const role of ROLES) {
    models[role] =
      env(`AI_${upper}_MODEL_${role.toUpperCase()}`) ??
      (role === "primary" ? env("AI_DEFAULT_MODEL") : null) ??
      defaults[role];
  }
  return models;
}

/**
 * The website builder's model lane is open by default. Creative authority stays
 * with the AI team; this helper exists only as a compatibility seam for callers
 * that need to report whether the external model lane is reachable.
 */
export function builderExternalAiAllowed(): boolean {
  return true;
}

/** A provider is available only when Revora's own key for it is present. */
export function providerConfig(provider: PaidProviderName): ProviderConfig | null {
  const apiKey = env(KEY_ENV[provider]);
  if (!apiKey) return null;
  return { name: provider, apiKey, models: modelsFor(provider) };
}

function readProviderName(value: string | null): PaidProviderName | null {
  return value === "google" || value === "openai" ? value : null;
}

/**
 * Provider order for a task: the configured default first, then the configured
 * secondary, then any other provider that happens to hold a key. Lovable's AI
 * Gateway is not in this list and can never be reached from here.
 */
export function providerChain(): ProviderConfig[] {
  const preferred = [
    readProviderName(env("AI_DEFAULT_PROVIDER")),
    readProviderName(env("AI_FALLBACK_PROVIDER")),
    // OpenAI is the verified-active lane; Google is tried after it so a stale
    // Google key never delays a call with a guaranteed first-provider failure.
    "openai" as PaidProviderName,
    "google" as PaidProviderName,
  ].filter((name): name is PaidProviderName => name !== null);

  const chain: ProviderConfig[] = [];
  for (const name of preferred) {
    if (chain.some((entry) => entry.name === name)) continue;
    const config = providerConfig(name);
    if (config) chain.push(config);
  }
  return chain;
}

export function isAiConfigured() {
  return providerChain().length > 0;
}

/** Throws the single fail-closed error when Revora owns no provider key. */
export function requireProviderChain(): ProviderConfig[] {
  const chain = providerChain();
  if (chain.length === 0) throw notConfigured();
  return chain;
}

/** Cost and abuse controls. Every value is environment-tunable. */
export type AiLimits = {
  /** Model calls one signed-in person may make per rolling day. */
  perUserDaily: number;
  /** Model calls one workspace may make per rolling day. */
  perWorkspaceDaily: number;
  /** Model calls one workspace may make per rolling month. */
  perWorkspaceMonthly: number;
  /** Characters of prompt Revora will send in one request. */
  maxRequestChars: number;
  /** Output token ceiling per request. */
  maxOutputTokens: number;
  /** Bytes of attached image/video/audio accepted in one request. */
  maxAttachmentBytes: number;
  /** Wall-clock ceiling for one provider call. */
  requestTimeoutMs: number;
  /** Attempts per provider for retryable failures (1 = no retry). */
  maxAttemptsPerProvider: number;
  /** Agent loop ceilings. */
  maxAgentIterations: number;
  maxToolCalls: number;
  maxAgentRuntimeMs: number;
  /** Concurrent model calls per workspace. */
  maxConcurrentPerWorkspace: number;
};

export function aiLimits(): AiLimits {
  return {
    perUserDaily: numberEnv("AI_MAX_REQUESTS_PER_USER_DAY", 300),
    perWorkspaceDaily: numberEnv("AI_MAX_REQUESTS_PER_WORKSPACE_DAY", 1000),
    perWorkspaceMonthly: numberEnv("AI_MAX_REQUESTS_PER_WORKSPACE_MONTH", 10000),
    maxRequestChars: numberEnv("AI_MAX_REQUEST_CHARS", 400000),
    maxOutputTokens: numberEnv("AI_MAX_OUTPUT_TOKENS", 8192),
    maxAttachmentBytes: numberEnv("AI_MAX_ATTACHMENT_BYTES", 24 * 1024 * 1024),
    requestTimeoutMs: numberEnv("AI_REQUEST_TIMEOUT_MS", 90_000),
    maxAttemptsPerProvider: numberEnv("AI_MAX_ATTEMPTS_PER_PROVIDER", 2),
    maxAgentIterations: numberEnv("AI_MAX_AGENT_ITERATIONS", 6),
    maxToolCalls: numberEnv("AI_MAX_TOOL_CALLS", 24),
    maxAgentRuntimeMs: numberEnv("AI_MAX_AGENT_RUNTIME_MS", 240_000),
    maxConcurrentPerWorkspace: numberEnv("AI_MAX_CONCURRENT_PER_WORKSPACE", 3),
  };
}

/** Rough per-million-token prices, used only for an estimate in admin reporting. */
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "gemini-3.8-flash": { input: 0.3, output: 2.5 },
  "gemini-3.6-flash": { input: 0.3, output: 2.5 },
  "gemini-3.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-3.1-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-3.1-flash-image": { input: 0.3, output: 2.5 },
  "gemini-3.5-transcribe": { input: 0.3, output: 2.5 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-image-1": { input: 5, output: 40 },
  "gpt-5.4-mini": { input: 0.4, output: 1.6 },
  "gpt-5.6-terra": { input: 0.5, output: 4 },
  "gpt-5.6-sol": { input: 1.25, output: 10 },
  "gpt-image-2": { input: 5, output: 40 },
  "gpt-image-2.5-sunburst": { input: 5, output: 40 },
  "gpt-image-2.5-flare": { input: 2, output: 16 },
  "whisper-1": { input: 0, output: 0 },
  "gpt-5.4-nano": { input: 0, output: 0 },
  "gpt-5-mini": { input: 0, output: 0 },
  "o4-mini": { input: 0, output: 0 },
  "o3-mini": { input: 0, output: 0 },
};

/** Returns null rather than a guess when the model's price isn't known. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number) {
  const price = PRICE_PER_MTOK[model];
  if (!price) return null;
  const cost = (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
