/**
 * THE LIVE MODEL CATALOGUE, NORMALIZED.
 *
 * Revora discovers models from every provider it already supports (Cloudflare
 * Workers AI, Groq, NVIDIA NIM, LLM7, OpenRouter, Google) and, above them, the
 * authoritative specialist six. This module turns whatever those catalogues
 * expose into one normalized capability record per model, annotated with health,
 * budget and probe evidence.
 *
 * Two rules it never breaks:
 *   - a capability is only recorded as supported when provider metadata or a
 *     live probe proves it; a model's NAME proves nothing;
 *   - the catalogue is scanned in full on refresh. There is no fixed sample and
 *     no hardcoded model ceiling, so a 500+ model pool is normal.
 *
 * Server-only. Reads `process.env` through the existing config helpers and never
 * returns a credential.
 */

import { providerConfig, type ModelRole } from "@/lib/ai/config";
import type { Capability, CapabilityState, ModelRecord } from "@/lib/ai/orchestration/contracts";
import { probeEvidence } from "@/lib/ai/orchestration/probe.server";
import { SPECIALIST_SIX, specialistRecord } from "@/lib/ai/orchestration/specialists";
import { buildFreeModelRegistry, type ModelCapability, type RegistryModel } from "@/lib/ai/registry.server";

const CAPABILITY_MAP: Partial<Record<ModelCapability, Capability[]>> = {
  planning: ["reasoning"],
  reasoning: ["reasoning"],
  coding: ["code_generation"],
  frontend: ["code_generation"],
  design: ["reasoning"],
  copy: ["text_generation"],
  seo: ["text_generation"],
  cro: ["text_generation"],
  accessibility: ["text_generation"],
  qa: ["text_generation"],
  critique: ["reasoning"],
  facts: ["text_generation"],
  security: ["reasoning"],
  vision: ["image_input"],
  image: ["image_generation"],
  transcription: ["speech_recognition", "audio_input"],
};

/** Roles the catalogue is scanned for. Every role is scanned in full. */
const SCANNED_ROLES: ModelRole[] = [
  "primary",
  "design",
  "fast",
  "coding",
  "vision",
  "image",
  "transcription",
];

function stateFor(proven: boolean, probed: CapabilityState | undefined): CapabilityState {
  if (probed) return probed;
  return proven ? "supported" : "unknown";
}

function normalize(entry: RegistryModel): ModelRecord {
  const capabilities: ModelRecord["capabilities"] = {};
  const probed = probeEvidence(entry.provider, entry.model);
  const declared = new Set<Capability>();
  for (const capability of entry.capabilities)
    for (const mapped of CAPABILITY_MAP[capability] ?? []) declared.add(mapped);
  // Every reachable chat model in the pool answers text; structured output and
  // tool calling are NOT assumed — they must be probed.
  if (entry.modality === "text" || entry.modality === "vision") declared.add("text_generation");
  if (entry.streaming) declared.add("streaming");

  const allCapabilities: Capability[] = [
    "text_generation",
    "reasoning",
    "code_generation",
    "structured_output",
    "tool_calling",
    "long_context",
    "image_input",
    "image_generation",
    "image_editing",
    "audio_input",
    "speech_recognition",
    "speech_synthesis",
    "video_input",
    "video_generation",
    "document_extraction",
    "ocr",
    "embeddings",
    "reranking",
    "classification",
    "moderation",
    "web_search",
    "computer_use",
    "multilingual",
    "streaming",
  ];
  const provenByMetadata = new Set<Capability>([...declared]);
  // Capabilities that can only ever be claimed from a probe or an explicit
  // provider declaration, never inferred from the catalogue id.
  for (const capability of ["structured_output", "tool_calling", "embeddings", "reranking", "document_extraction", "ocr", "web_search", "computer_use", "video_input", "video_generation", "speech_synthesis", "image_editing", "moderation"] as Capability[])
    provenByMetadata.delete(capability);

  for (const capability of allCapabilities)
    capabilities[capability] = stateFor(provenByMetadata.has(capability), probed[capability]);

  const inputModalities: ModelRecord["inputModalities"] =
    entry.modality === "vision"
      ? ["text", "image"]
      : entry.modality === "transcription"
        ? ["audio"]
        : ["text"];
  const outputModalities: ModelRecord["outputModalities"] =
    entry.modality === "image" ? ["image"] : ["text"];

  return {
    id: entry.model,
    provider: entry.provider,
    displayName: entry.displayName,
    capabilities,
    inputModalities,
    outputModalities,
    contextTokens: entry.contextWindow,
    maxOutputTokens: null,
    // Quality is the provider-evidenced capability weight, not a marketing tier.
    quality: entry.weight,
    reliability: entry.health.healthy ? Math.max(20, 100 - entry.health.failures * 15) : 20,
    latencyMs: null,
    paid: false,
    costPerMTok: 0,
    specialist: false,
    specializations: [],
    languages: ["*"],
    evidence: Object.keys(probed).length > 0 ? "probe" : "provider_metadata",
    verifiedAt: entry.verifiedAt,
    healthy: entry.health.healthy,
    blockedReason:
      entry.quota.remainingToday !== null && entry.quota.remainingToday <= 0
        ? "daily provider allowance spent"
        : entry.health.cooldownUntil && entry.health.cooldownUntil > Date.now()
          ? "provider cooling down after repeated failures"
          : null,
  };
}

export type CatalogSnapshot = {
  at: number;
  /** Specialist-six records, health-annotated. */
  specialists: ModelRecord[];
  /** Every other discovered model, normalized. Unbounded by design. */
  models: ModelRecord[];
  totals: { discovered: number; verified: number; healthy: number; specialists: number };
};

let snapshot: CatalogSnapshot | null = null;

export function catalogSnapshot() {
  return snapshot;
}

export function resetCatalogSnapshot() {
  snapshot = null;
}

/** Are the specialist six reachable at all (OpenAI credentials present)? */
function specialistRuntime(): { healthy: boolean; blockedReason: string | null } {
  const config = providerConfig("openai");
  if (!config) return { healthy: false, blockedReason: "no provider credentials configured" };
  return { healthy: true, blockedReason: null };
}

/**
 * Scans every supported provider catalogue for every role and returns the whole
 * normalized model set. Discovery failure is never fatal: a provider that does
 * not answer simply contributes nothing this cycle.
 */
export async function buildModelCatalog(): Promise<CatalogSnapshot> {
  const seen = new Map<string, ModelRecord>();
  for (const role of SCANNED_ROLES) {
    let registry: RegistryModel[] = [];
    try {
      registry = await buildFreeModelRegistry(role);
    } catch {
      registry = [];
    }
    for (const entry of registry) {
      const record = normalize(entry);
      const key = `${record.provider}/${record.id}`;
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, record);
        continue;
      }
      // A model discovered in several role pools keeps the union of its proven
      // capabilities, so one scan never erases another's evidence.
      for (const [capability, state] of Object.entries(record.capabilities) as [
        Capability,
        CapabilityState,
      ][])
        if (state === "supported") existing.capabilities[capability] = "supported";
      for (const modality of record.inputModalities)
        if (!existing.inputModalities.includes(modality)) existing.inputModalities.push(modality);
      for (const modality of record.outputModalities)
        if (!existing.outputModalities.includes(modality)) existing.outputModalities.push(modality);
    }
  }

  const runtime = specialistRuntime();
  const specialists = SPECIALIST_SIX.map((entry) => specialistRecord(entry, runtime));
  const models = [...seen.values()].sort((a, b) => b.quality - a.quality);
  snapshot = {
    at: Date.now(),
    specialists,
    models,
    totals: {
      discovered: models.length + specialists.length,
      verified: models.filter((record) => record.evidence === "probe").length + specialists.length,
      healthy:
        models.filter((record) => record.healthy && !record.blockedReason).length +
        specialists.filter((record) => record.healthy).length,
      specialists: specialists.filter((record) => record.healthy).length,
    },
  };
  return snapshot;
}
