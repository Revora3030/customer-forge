/**
 * The extended OpenAI roster — every model added in the "one big build",
 * registered ALONGSIDE the Specialist Six (nothing existing is removed).
 *
 * These are capability reserves: they enter the live catalogue as paid,
 * non-specialist records, so capability-first routing may use them for
 * verified gaps and failover, but they never take a domain away from Sol,
 * Terra or Luna. Reachability is proven at runtime by the account's own
 * model endpoint, never assumed from a name.
 *
 * Pure module: no environment, no network, no secrets.
 */

import type { Capability, ModelRecord } from "@/lib/ai/orchestration/contracts";

export type RosterEntry = {
  model: string;
  role: string;
  capabilities: Capability[];
  quality: number;
  contextTokens: number | null;
  /** Covered by OpenAI's shared-traffic daily allowance (tokens/day), if any. */
  freeDailyTokens: number | null;
  output: "text" | "image" | "video";
};

const TEXT: Capability[] = ["text_generation", "reasoning", "structured_output", "streaming", "multilingual"];
const SMALL = 2_500_000;
const FLAGSHIP = 250_000;

export const OPENAI_ROSTER: RosterEntry[] = [
  { model: "gpt-5.6-sol", role: "Previous Sol, kept as a master reasoning backup", capabilities: [...TEXT, "code_generation", "image_input", "long_context", "tool_calling"], quality: 98, contextTokens: 400_000, freeDailyTokens: null, output: "text" },
  { model: "gpt-6-astra", role: "Conversational co-pilot and consultation", capabilities: [...TEXT, "image_input", "long_context", "tool_calling"], quality: 97, contextTokens: 400_000, freeDailyTokens: null, output: "text" },
  { model: "gpt-5.6-luna", role: "Previous Luna, kept as a utility backup", capabilities: [...TEXT, "tool_calling"], quality: 80, contextTokens: 128_000, freeDailyTokens: null, output: "text" },
  { model: "gpt-5.5-pro", role: "Deep architectural and accessibility audits", capabilities: [...TEXT, "code_generation", "long_context"], quality: 94, contextTokens: 400_000, freeDailyTokens: null, output: "text" },
  { model: "gpt-5.5", role: "Flagship reasoning reserve", capabilities: [...TEXT, "code_generation", "image_input", "long_context", "tool_calling"], quality: 93, contextTokens: 400_000, freeDailyTokens: null, output: "text" },
  { model: "o3", role: "Logic, math and flow proofing", capabilities: [...TEXT, "code_generation"], quality: 88, contextTokens: 200_000, freeDailyTokens: FLAGSHIP, output: "text" },
  { model: "o4-mini", role: "Zero-cost contract and code validation", capabilities: [...TEXT, "code_generation"], quality: 82, contextTokens: 200_000, freeDailyTokens: SMALL, output: "text" },
  { model: "o3-mini", role: "Zero-cost structured validation", capabilities: [...TEXT, "code_generation"], quality: 78, contextTokens: 200_000, freeDailyTokens: SMALL, output: "text" },
  { model: "gpt-5.4-nano", role: "Zero-cost micro-edits", capabilities: TEXT, quality: 70, contextTokens: 128_000, freeDailyTokens: SMALL, output: "text" },
  { model: "gpt-5-mini", role: "Zero-cost small edits and rewrites", capabilities: TEXT, quality: 76, contextTokens: 128_000, freeDailyTokens: SMALL, output: "text" },
  { model: "gpt-4.1-mini", role: "Zero-cost routine transforms", capabilities: TEXT, quality: 72, contextTokens: 1_000_000, freeDailyTokens: SMALL, output: "text" },
  { model: "whisper-1", role: "Previous transcription model, kept as a backup", capabilities: ["speech_recognition", "audio_input", "multilingual"], quality: 85, contextTokens: null, freeDailyTokens: null, output: "text" },
  { model: "sora-2", role: "Cinematic video backgrounds (registered, not yet wired to the renderer)", capabilities: ["video_generation"], quality: 88, contextTokens: null, freeDailyTokens: null, output: "video" },
  { model: "sora-2-pro", role: "Premium cinematic video (registered, not yet wired to the renderer)", capabilities: ["video_generation"], quality: 93, contextTokens: null, freeDailyTokens: null, output: "video" },
];

export const OPENAI_ROSTER_IDS = OPENAI_ROSTER.map((entry) => entry.model);

export function rosterEntry(model: string): RosterEntry | null {
  return OPENAI_ROSTER.find((entry) => entry.model === model) ?? null;
}

/** Models that run inside the shared-traffic free daily allowance. */
export function freeAllowanceModels(): RosterEntry[] {
  return OPENAI_ROSTER.filter((entry) => entry.freeDailyTokens !== null);
}

export function rosterRecord(
  entry: RosterEntry,
  runtime: { healthy?: boolean; blockedReason?: string | null } = {},
): ModelRecord {
  const capabilities: ModelRecord["capabilities"] = {};
  for (const capability of entry.capabilities) capabilities[capability] = "supported";
  return {
    id: entry.model,
    provider: "openai",
    displayName: `${entry.model} · ${entry.role}`,
    capabilities,
    inputModalities: entry.capabilities.includes("audio_input")
      ? ["audio"]
      : entry.capabilities.includes("image_input")
        ? ["text", "image"]
        : ["text"],
    outputModalities: entry.output === "image" ? ["image"] : ["text"],
    contextTokens: entry.contextTokens,
    maxOutputTokens: entry.contextTokens === null ? null : 32_000,
    quality: entry.quality,
    reliability: 90,
    latencyMs: null,
    paid: entry.freeDailyTokens === null,
    costPerMTok: entry.freeDailyTokens === null ? null : 0,
    specialist: false,
    specializations: [],
    languages: ["*"],
    evidence: "declared",
    verifiedAt: Date.now(),
    healthy: runtime.healthy ?? true,
    blockedReason:
      runtime.blockedReason ??
      (entry.output === "video" ? "video renderer not wired yet" : null),
  };
}
