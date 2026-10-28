import { LOVABLE_CONVERSATION_MODELS } from "./lovable-models";
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

/** Lovable AI is the only provider Revora addresses. */
export type ProviderName = "lovable";

/** Kept as an alias: the only billed provider is Lovable AI. */
export type PaidProviderName = ProviderName;

/**
 * `design` is the creative-judgement role: palette, backdrop, section mix and
 * page order. `conversation` is Jarvis and the client-facing intake.
 */
export type ModelRole =
  | "primary"
  | "design"
  | "fast"
  | "vision"
  | "coding"
  | "image"
  | "transcription"
  | "conversation";

export type ProviderConfig = {
  name: ProviderName;
  apiKey: string;
  models: Record<ModelRole, string>;
};

/**
 * Per-job Lovable AI rosters (owner decision 2026-10-22: best model per job).
 * Each role is a comma-separated list; the router fails over across every id
 * in order. Every id is in the live Lovable AI catalogue. Overridable per role
 * with AI_LOVABLE_MODEL_<ROLE>.
 */
const DEFAULT_MODELS: Record<ModelRole, string> = {
  // Wording and review: Claude Sonnet 5 leads, then GPT-6.1 Sol.
  primary: [
    "anthropic/claude-sonnet-5", "openai/gpt-6.1-sol", "google/gemini-4-argon", "openai/gpt-6-astra",
    "anthropic/claude-opus-5", "openai/gpt-6-sol", "google/gemini-3.8-flash", "openai/gpt-5.6-sol",
    "openai/gpt-5.5", "openai/gpt-5.6-terra",
  ].join(","),
  // Identity, design and layout: GPT-6.1 Sol leads for speed (long Opus 5.5
  // design answers ran past the request time limit), then Sonnet 5, then Opus.
  design: [
    "openai/gpt-6.1-sol", "anthropic/claude-sonnet-5", "google/gemini-4-argon", "anthropic/claude-opus-5-5",
    "openai/gpt-6-astra", "anthropic/claude-fable-5-1", "openai/gpt-6-sol", "google/gemini-3.1-pro-preview",
  ].join(","),
  fast: [
    "google/gemini-3.1-flash-lite", "openai/gpt-5.4-mini", "anthropic/claude-haiku-4-5", "openai/gpt-6-luna",
    "openai/gpt-5.6-luna", "google/gemini-3-flash-preview",
  ].join(","),
  // Picture and screenshot review: Gemini 3.8 Flash reads images best.
  vision: [
    "google/gemini-3.8-flash", "google/gemini-4-argon", "anthropic/claude-sonnet-5", "openai/gpt-6.1-sol",
    "google/gemini-3.1-pro-preview",
  ].join(","),
  // Plan checking and layout repair: GPT-6.1 Sol, then Gemini 4 Argon.
  coding: [
    "openai/gpt-6.1-sol", "google/gemini-4-argon", "anthropic/claude-opus-5-5", "openai/gpt-6-astra",
    "anthropic/claude-sonnet-5", "openai/gpt-5.5", "google/gemini-3.8-flash",
  ].join(","),
  image: [
    "openai/gpt-image-2.5-sunburst", "google/gemini-3-pro-image", "openai/gpt-image-2",
    "openai/gpt-image-2.5-flare", "google/gemini-3.1-flash-lite-image",
  ].join(","),
  transcription: "openai/gpt-transcribe,google/gemini-3.5-transcribe",
  // Jarvis: strongest verified models first, then faster ones as failover.
  conversation: LOVABLE_CONVERSATION_MODELS.join(","),
};

const ROLES = Object.keys(DEFAULT_MODELS) as ModelRole[];

function env(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberEnv(name: string, fallback: number) {
  const raw = env(name);
  const parsed = raw === null ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function modelsFor(): Record<ModelRole, string> {
  const models = {} as Record<ModelRole, string>;
  for (const role of ROLES) models[role] = env(`AI_LOVABLE_MODEL_${role.toUpperCase()}`) ?? DEFAULT_MODELS[role];
  return models;
}

/** Lovable AI is available only when LOVABLE_API_KEY is present. */
export function providerConfig(_provider: ProviderName = "lovable"): ProviderConfig | null {
  const apiKey = env("LOVABLE_API_KEY");
  if (!apiKey) return null;
  return { name: "lovable", apiKey, models: modelsFor() };
}

/** The provider chain: Lovable AI, or nothing (fail closed). */
export function providerChain(): ProviderConfig[] {
  const config = providerConfig();
  return config ? [config] : [];
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
    // Section layouts ask for 16k and the edit planner for 32k tokens. A lower
    // ceiling silently truncated those answers into unparseable JSON.
    maxOutputTokens: numberEnv("AI_MAX_OUTPUT_TOKENS", 32000),
    maxAttachmentBytes: numberEnv("AI_MAX_ATTACHMENT_BYTES", 24 * 1024 * 1024),
    requestTimeoutMs: numberEnv("AI_REQUEST_TIMEOUT_MS", 90_000),
    maxAttemptsPerProvider: numberEnv("AI_MAX_ATTEMPTS_PER_PROVIDER", 2),
    maxAgentIterations: numberEnv("AI_MAX_AGENT_ITERATIONS", 6),
    maxToolCalls: numberEnv("AI_MAX_TOOL_CALLS", 24),
    maxAgentRuntimeMs: numberEnv("AI_MAX_AGENT_RUNTIME_MS", 240_000),
    // The review panel fans out up to 15 reviewers at once; a ceiling of 3
    // refused most of them as "already working" and pushed the rest to paid.
    maxConcurrentPerWorkspace: numberEnv("AI_MAX_CONCURRENT_PER_WORKSPACE", 16),
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
  // Rough admin estimates for the current Lovable roster, aligned with the
  // existing sol / terra / flash bands. Not an invoice.
  "gpt-6.1-sol": { input: 1.25, output: 10 },
  "gpt-6-sol": { input: 1.25, output: 10 },
  "gpt-5.5": { input: 1.25, output: 10 },
  "gemini-4-argon": { input: 1.25, output: 10 },
  "gemini-3.1-pro-preview": { input: 1.25, output: 10 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-5-5": { input: 5, output: 25 },
  "claude-fable-5-1": { input: 5, output: 25 },
  "claude-haiku-4-5": { input: 0.25, output: 1.25 },
  "gpt-6-astra": { input: 0.5, output: 4 },
  "gpt-6-luna": { input: 0.5, output: 4 },
  "gpt-5.6-luna": { input: 0.5, output: 4 },
  "gemini-3-flash-preview": { input: 0.3, output: 2.5 },
  "gpt-image-2": { input: 5, output: 40 },
  "gpt-image-2.5-sunburst": { input: 5, output: 40 },
  "gpt-image-2.5-flare": { input: 2, output: 16 },
  "whisper-1": { input: 0, output: 0 },
  "gpt-5.4-nano": { input: 0, output: 0 },
  "gpt-5-mini": { input: 0, output: 0 },
  "o4-mini": { input: 0, output: 0 },
  "o3-mini": { input: 0, output: 0 },
};

/**
 * Telemetry records catalogue ids (`google/gemini-3.8-flash`). The price table
 * is keyed by the bare id. Either form resolves; an unknown model stays null.
 */
export function priceForModel(model: string): { input: number; output: number } | null {
  const bare = model.includes("/") ? model.slice(model.lastIndexOf("/") + 1) : model;
  return PRICE_PER_MTOK[model] ?? PRICE_PER_MTOK[bare] ?? null;
}

/**
 * Stored telemetry often has a null cost because older writes looked up the
 * bare id. Recompute from the model and token counts when the stored figure
 * is missing. A stored number, including zero, is kept.
 */
export function eventCostUsd(event: {
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  estimated_cost_usd?: number | null;
}): number | null {
  if (typeof event.estimated_cost_usd === "number") return event.estimated_cost_usd;
  if (!event.model) return null;
  return estimateCostUsd(event.model, event.input_tokens ?? 0, event.output_tokens ?? 0);
}

/** Returns null rather than a guess when the model's price isn't known. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number) {
  const price = priceForModel(model);
  if (!price) return null;
  const cost = (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
