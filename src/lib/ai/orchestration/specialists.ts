/**
 * THE AUTHORITATIVE SPECIALIST SIX.
 *
 * Six models are the platform's capability ceiling and own their domains
 * outright. Nothing in the dynamic catalogue — however large it grows — may
 * take a domain away from them, and no model may be added to a job merely to
 * raise the model count.
 *
 *   sol      master reasoning, creative direction, architecture, synthesis
 *   terra    adversarial review, second opinions, verification, repair planning
 *   luna     metadata, routine transformation, deterministic utility work
 *   sunburst hero / editorial / precision imagery
 *   flare    supporting photography, variations, visual expansion
 *   whisper  speech transcription
 *
 * Pure module: no environment, no network, no secrets.
 */

import type {
  Capability,
  ModelRecord,
  TaskContract,
  TaskKind,
} from "@/lib/ai/orchestration/contracts";
import { missingCapabilities, supports } from "@/lib/ai/orchestration/contracts";

export type SpecialistId = "sol" | "terra" | "luna" | "sunburst" | "flare" | "whisper";

export type Specialist = {
  id: SpecialistId;
  model: string;
  provider: "openai";
  /** Human-readable job description, shown in admin explainability. */
  charter: string;
  /** Domains this specialist owns. Owning a domain means it leads the task. */
  domains: TaskKind[];
  capabilities: Capability[];
  quality: number;
  contextTokens: number | null;
};

export const SPECIALIST_SIX: Specialist[] = [
  {
    id: "sol",
    model: "gpt-5.6-sol",
    provider: "openai",
    charter:
      "Master reasoning and site-wide creative authority: unique identity, editorial hierarchy, page-specific composition, information and conversion architecture, visual reasoning, quality review and final synthesis.",
    domains: [
      "creative_direction",
      "information_architecture",
      "conversion_architecture",
      "content_strategy",
      "visual_review",
      "quality_review",
      "synthesis",
      "hard_request",
      "design_fingerprint",
      "code_analysis",
    ],
    capabilities: [
      "text_generation",
      "reasoning",
      "structured_output",
      "tool_calling",
      "code_generation",
      "image_input",
      "long_context",
      "streaming",
      "multilingual",
    ],
    quality: 98,
    contextTokens: 400_000,
  },
  {
    id: "terra",
    model: "gpt-5.6-terra",
    provider: "openai",
    charter:
      "Senior adversarial verification: rejects generic repetition, weak hierarchy, incomplete pages, missing visuals and conversion gaps; owns independent review and repair planning.",
    domains: [
      "adversarial_review",
      "second_opinion",
      "specialist_review",
      "plan_review",
      "repair_plan",
      "seo_analysis",
      "design_alternative",
    ],
    capabilities: [
      "text_generation",
      "reasoning",
      "structured_output",
      "tool_calling",
      "code_generation",
      "image_input",
      "long_context",
      "streaming",
      "multilingual",
    ],
    quality: 92,
    contextTokens: 256_000,
  },
  {
    id: "luna",
    model: "gpt-5.6-luna",
    provider: "openai",
    charter:
      "Post-creative utility: metadata, structured details, routine transformation, extraction and classification after the design passes review.",
    domains: ["metadata", "rewrite", "small_edit", "extraction", "classification", "intent"],
    capabilities: [
      "text_generation",
      "reasoning",
      "structured_output",
      "tool_calling",
      "streaming",
      "multilingual",
    ],
    quality: 80,
    contextTokens: 128_000,
  },
  {
    id: "sunburst",
    model: "gpt-image-2.5-sunburst",
    provider: "openai",
    charter: "Cinematic hero, editorial feature and precision image generation/editing with deliberate focal points, negative space and responsive crops.",
    domains: ["image_hero", "image_edit"],
    capabilities: ["image_generation", "image_editing", "image_input"],
    quality: 95,
    contextTokens: null,
  },
  {
    id: "flare",
    model: "gpt-image-2.5-flare",
    provider: "openai",
    charter: "Service-specific supporting photography, detail frames, page-level visual expansion, variations and coherent campaign support.",
    domains: ["image_support"],
    capabilities: ["image_generation", "image_input"],
    quality: 86,
    contextTokens: null,
  },
  {
    id: "whisper",
    model: "whisper-1",
    provider: "openai",
    charter: "Speech transcription.",
    domains: ["transcription"],
    capabilities: ["speech_recognition", "audio_input", "multilingual"],
    quality: 85,
    contextTokens: null,
  },
];

export const SPECIALIST_MODEL_IDS = SPECIALIST_SIX.map((entry) => entry.model);

export function isSpecialistModel(model: string): boolean {
  return SPECIALIST_MODEL_IDS.includes(model);
}

export function specialistById(id: SpecialistId): Specialist {
  const found = SPECIALIST_SIX.find((entry) => entry.id === id);
  if (!found) throw new Error(`unknown specialist ${id}`);
  return found;
}

/** The specialist that owns a task domain, or null when no one owns it. */
export function domainOwner(task: TaskKind): Specialist | null {
  return SPECIALIST_SIX.find((entry) => entry.domains.includes(task)) ?? null;
}

/** A specialist's record in catalogue form, so scoring treats it like any model. */
export function specialistRecord(
  specialist: Specialist,
  runtime: { healthy?: boolean; reliability?: number; latencyMs?: number | null; blockedReason?: string | null } = {},
): ModelRecord {
  const capabilities: ModelRecord["capabilities"] = {};
  for (const capability of specialist.capabilities) capabilities[capability] = "supported";
  const imageOut = specialist.capabilities.includes("image_generation");
  return {
    id: specialist.model,
    provider: specialist.provider,
    displayName: `${specialist.id} · ${specialist.model}`,
    capabilities,
    inputModalities: specialist.capabilities.includes("audio_input")
      ? ["audio"]
      : specialist.capabilities.includes("image_input")
        ? ["text", "image"]
        : ["text"],
    outputModalities: imageOut ? ["image"] : ["text"],
    contextTokens: specialist.contextTokens,
    maxOutputTokens: specialist.contextTokens === null ? null : 32_000,
    quality: specialist.quality,
    reliability: runtime.reliability ?? 95,
    latencyMs: runtime.latencyMs ?? null,
    paid: true,
    costPerMTok: null,
    specialist: true,
    specializations: [specialist.id],
    languages: ["*"],
    evidence: "declared",
    verifiedAt: Date.now(),
    healthy: runtime.healthy ?? true,
    blockedReason: runtime.blockedReason ?? null,
  };
}

export type SpecialistCoverage = {
  /** The specialist that leads this task, when one owns the domain and is usable. */
  owner: Specialist | null;
  /** Ownership exists but the specialist cannot serve the contract right now. */
  ownerBlocked: string | null;
  /** Required capabilities the six can prove they cover. */
  covered: Capability[];
  /** Required capabilities NO reachable specialist covers — the gap set. */
  gaps: Capability[];
  /** Per-specialist availability, for explainability. */
  available: SpecialistId[];
};

/**
 * What the specialist six can genuinely do for one contract, given which of
 * them are reachable right now. Capability coverage is computed from proven
 * capability records, never from the fact that a specialist exists.
 */
export function specialistCoverage(input: {
  contract: TaskContract;
  /** Specialist records as the catalogue currently sees them (health included). */
  records: ModelRecord[];
}): SpecialistCoverage {
  const usable = input.records.filter(
    (record) => record.specialist && record.healthy && !record.blockedReason,
  );
  const available = SPECIALIST_SIX.filter((entry) =>
    usable.some((record) => record.id === entry.model),
  ).map((entry) => entry.id);

  const covered: Capability[] = [];
  for (const capability of [...input.contract.required, ...input.contract.preferred])
    if (!covered.includes(capability) && usable.some((record) => supports(record, capability)))
      covered.push(capability);
  const gaps = input.contract.required.filter((capability) => !covered.includes(capability));

  const owner = domainOwner(input.contract.task);
  let ownerBlocked: string | null = null;
  let effectiveOwner: Specialist | null = null;
  if (owner) {
    const record = input.records.find((entry) => entry.id === owner.model);
    if (!record) ownerBlocked = "not configured";
    else if (record.blockedReason) ownerBlocked = record.blockedReason;
    else if (!record.healthy) ownerBlocked = "unhealthy";
    else if (missingCapabilities(record, input.contract.required).length > 0)
      ownerBlocked = `missing ${missingCapabilities(record, input.contract.required).join(", ")}`;
    else effectiveOwner = owner;
  }

  return { owner: effectiveOwner, ownerBlocked, covered, gaps, available };
}
