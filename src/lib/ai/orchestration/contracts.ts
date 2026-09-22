/**
 * TYPED CAPABILITY CONTRACTS — the vocabulary the whole orchestrator speaks.
 *
 * Every routing decision in Revora starts by turning a job into a precise
 * capability contract: what the work genuinely requires, in which modalities,
 * with which output guarantees. Nothing downstream is allowed to guess from a
 * model's name, and nothing is allowed to treat price as a capability.
 *
 * Pure and environment-free on purpose, so the routing policy is unit-testable
 * and cannot reach a provider or a secret.
 */

/** Everything a model can be required to actually do. */
export type Capability =
  | "text_generation"
  | "reasoning"
  | "code_generation"
  | "structured_output"
  | "tool_calling"
  | "long_context"
  | "image_input"
  | "image_generation"
  | "image_editing"
  | "audio_input"
  | "speech_recognition"
  | "speech_synthesis"
  | "video_input"
  | "video_generation"
  | "document_extraction"
  | "ocr"
  | "embeddings"
  | "reranking"
  | "classification"
  | "moderation"
  | "web_search"
  | "computer_use"
  | "multilingual"
  | "streaming";

/**
 * What Revora actually knows about one capability of one model. "unknown" and
 * "probe_failed" are deliberately distinct from "unsupported": an unproven
 * capability must never be advertised, and a provider outage must never be
 * recorded as a missing feature.
 */
export type CapabilityState =
  | "supported"
  | "unsupported"
  | "probe_failed"
  | "unavailable"
  | "unknown";

/** Only a proven capability may satisfy a contract. */
export function capabilitySatisfied(state: CapabilityState | undefined): boolean {
  return state === "supported";
}

export type Modality = "text" | "image" | "audio" | "video" | "vector";

/** Named jobs the platform routes. Named after the work, never after a model. */
export type TaskKind =
  // master reasoning / creative
  | "creative_direction"
  | "information_architecture"
  | "conversion_architecture"
  | "content_strategy"
  | "visual_review"
  | "quality_review"
  | "synthesis"
  | "hard_request"
  | "design_fingerprint"
  // senior verification
  | "adversarial_review"
  | "second_opinion"
  | "specialist_review"
  | "plan_review"
  | "repair_plan"
  | "seo_analysis"
  | "design_alternative"
  // routine utility
  | "metadata"
  | "rewrite"
  | "small_edit"
  | "extraction"
  | "classification"
  | "intent"
  // media / non-text lanes
  | "image_hero"
  | "image_support"
  | "image_edit"
  | "transcription"
  // capability lanes the specialist six do not own
  | "embeddings"
  | "reranking"
  | "document_extraction"
  | "video_understanding"
  | "video_generation"
  | "web_research"
  | "code_analysis"
  | "moderation";

export type TaskComplexity = "low" | "medium" | "high";

export type TaskContract = {
  task: TaskKind;
  /** Hard requirements. A candidate missing any of these is ineligible. */
  required: Capability[];
  /** Nice-to-have capabilities; they raise a score, never gate eligibility. */
  preferred: Capability[];
  inputModality: Modality;
  outputModality: Modality;
  /** Minimum usable context window in tokens, when the job implies one. */
  minContextTokens: number;
  /** Minimum output headroom in tokens. */
  minOutputTokens: number;
  complexity: TaskComplexity;
  /** Latency the caller can live with; used only after quality and fit. */
  latencyBudgetMs: number;
  /** True when the answer is parsed by code and must validate against a schema. */
  schemaBound: boolean;
  /** True when the job handles tenant content and needs the safest providers. */
  sensitive: boolean;
};

const TEXT_BASE = {
  inputModality: "text" as Modality,
  outputModality: "text" as Modality,
  preferred: ["streaming"] as Capability[],
  minOutputTokens: 1024,
  latencyBudgetMs: 90_000,
  sensitive: true,
};

function text(
  task: TaskKind,
  complexity: TaskComplexity,
  required: Capability[],
  options: Partial<TaskContract> = {},
): TaskContract {
  return {
    ...TEXT_BASE,
    task,
    complexity,
    required,
    minContextTokens: complexity === "high" ? 32_000 : complexity === "medium" ? 16_000 : 8_000,
    schemaBound: true,
    ...options,
  };
}

/**
 * The canonical contract per task. Callers may override single fields (a very
 * long document raises `minContextTokens`, a live UI lowers the latency budget)
 * but never the required-capability set implied by the work itself.
 */
const CONTRACTS: Record<TaskKind, TaskContract> = {
  creative_direction: text("creative_direction", "high", [
    "text_generation",
    "reasoning",
    "structured_output",
  ]),
  information_architecture: text("information_architecture", "high", [
    "text_generation",
    "reasoning",
    "structured_output",
  ]),
  conversion_architecture: text("conversion_architecture", "high", [
    "text_generation",
    "reasoning",
    "structured_output",
  ]),
  content_strategy: text("content_strategy", "high", [
    "text_generation",
    "reasoning",
    "structured_output",
  ]),
  visual_review: text("visual_review", "high", [
    "image_input",
    "reasoning",
    "structured_output",
  ], { inputModality: "image" }),
  quality_review: text("quality_review", "high", [
    "text_generation",
    "reasoning",
    "structured_output",
  ]),
  synthesis: text("synthesis", "high", ["text_generation", "reasoning", "structured_output"], {
    minContextTokens: 64_000,
  }),
  hard_request: text("hard_request", "high", [
    "text_generation",
    "reasoning",
    "structured_output",
  ]),
  design_fingerprint: text(
    "design_fingerprint",
    "high",
    ["image_input", "reasoning", "structured_output"],
    { inputModality: "image" },
  ),

  adversarial_review: text("adversarial_review", "medium", [
    "text_generation",
    "reasoning",
    "structured_output",
  ]),
  second_opinion: text("second_opinion", "medium", [
    "text_generation",
    "reasoning",
    "structured_output",
  ]),
  specialist_review: text("specialist_review", "medium", [
    "text_generation",
    "reasoning",
    "structured_output",
  ]),
  plan_review: text("plan_review", "medium", [
    "text_generation",
    "reasoning",
    "structured_output",
  ]),
  repair_plan: text("repair_plan", "medium", [
    "text_generation",
    "reasoning",
    "structured_output",
  ]),
  seo_analysis: text("seo_analysis", "medium", [
    "text_generation",
    "reasoning",
    "structured_output",
  ]),
  design_alternative: text("design_alternative", "medium", [
    "text_generation",
    "reasoning",
    "structured_output",
  ]),

  metadata: text("metadata", "low", ["text_generation", "structured_output"], {
    latencyBudgetMs: 30_000,
  }),
  rewrite: text("rewrite", "low", ["text_generation"], { schemaBound: false }),
  small_edit: text("small_edit", "low", ["text_generation"], { schemaBound: false }),
  extraction: text("extraction", "low", ["text_generation", "structured_output"]),
  classification: text("classification", "low", ["text_generation", "structured_output"], {
    latencyBudgetMs: 20_000,
  }),
  intent: text("intent", "low", ["text_generation", "structured_output"], {
    latencyBudgetMs: 20_000,
  }),

  image_hero: {
    task: "image_hero",
    required: ["image_generation"],
    preferred: [],
    inputModality: "text",
    outputModality: "image",
    minContextTokens: 0,
    minOutputTokens: 0,
    complexity: "high",
    latencyBudgetMs: 120_000,
    schemaBound: false,
    sensitive: true,
  },
  image_support: {
    task: "image_support",
    required: ["image_generation"],
    preferred: [],
    inputModality: "text",
    outputModality: "image",
    minContextTokens: 0,
    minOutputTokens: 0,
    complexity: "medium",
    latencyBudgetMs: 90_000,
    schemaBound: false,
    sensitive: true,
  },
  image_edit: {
    task: "image_edit",
    required: ["image_editing"],
    preferred: ["image_input"],
    inputModality: "image",
    outputModality: "image",
    minContextTokens: 0,
    minOutputTokens: 0,
    complexity: "medium",
    latencyBudgetMs: 120_000,
    schemaBound: false,
    sensitive: true,
  },
  transcription: {
    task: "transcription",
    required: ["speech_recognition", "audio_input"],
    preferred: ["multilingual"],
    inputModality: "audio",
    outputModality: "text",
    minContextTokens: 0,
    minOutputTokens: 512,
    complexity: "medium",
    latencyBudgetMs: 120_000,
    schemaBound: false,
    sensitive: true,
  },

  embeddings: {
    task: "embeddings",
    required: ["embeddings"],
    preferred: ["multilingual"],
    inputModality: "text",
    outputModality: "vector",
    minContextTokens: 2_000,
    minOutputTokens: 0,
    complexity: "low",
    latencyBudgetMs: 30_000,
    schemaBound: false,
    sensitive: true,
  },
  reranking: {
    task: "reranking",
    required: ["reranking"],
    preferred: [],
    inputModality: "text",
    outputModality: "vector",
    minContextTokens: 8_000,
    minOutputTokens: 0,
    complexity: "low",
    latencyBudgetMs: 30_000,
    schemaBound: false,
    sensitive: true,
  },
  document_extraction: text(
    "document_extraction",
    "medium",
    ["document_extraction", "structured_output"],
    { minContextTokens: 128_000 },
  ),
  video_understanding: {
    task: "video_understanding",
    required: ["video_input", "reasoning"],
    preferred: ["structured_output"],
    inputModality: "video",
    outputModality: "text",
    minContextTokens: 32_000,
    minOutputTokens: 1024,
    complexity: "high",
    latencyBudgetMs: 180_000,
    schemaBound: false,
    sensitive: true,
  },
  video_generation: {
    task: "video_generation",
    required: ["video_generation"],
    preferred: [],
    inputModality: "text",
    outputModality: "video",
    minContextTokens: 0,
    minOutputTokens: 0,
    complexity: "high",
    latencyBudgetMs: 600_000,
    schemaBound: false,
    sensitive: true,
  },
  web_research: text("web_research", "medium", ["web_search", "text_generation"], {
    schemaBound: false,
  }),
  code_analysis: text("code_analysis", "high", [
    "code_generation",
    "reasoning",
    "structured_output",
  ]),
  moderation: text("moderation", "low", ["moderation"], { schemaBound: false }),
};

export function contractFor(task: TaskKind, overrides: Partial<TaskContract> = {}): TaskContract {
  const base = CONTRACTS[task];
  return {
    ...base,
    ...overrides,
    // The required set is a property of the work, so an override may only ever
    // ADD requirements — it can never relax the contract to admit a weaker model.
    required: [...new Set([...base.required, ...(overrides.required ?? [])])],
    preferred: [...new Set([...base.preferred, ...(overrides.preferred ?? [])])],
  };
}

export const ALL_TASKS = Object.keys(CONTRACTS) as TaskKind[];

/** What is known about one model, normalized across every provider catalogue. */
export type ModelRecord = {
  id: string;
  provider: string;
  displayName: string;
  /** Verified capability state per capability. Absent = "unknown". */
  capabilities: Partial<Record<Capability, CapabilityState>>;
  inputModalities: Modality[];
  outputModalities: Modality[];
  contextTokens: number | null;
  maxOutputTokens: number | null;
  /** 0-100 quality estimate from provider metadata and Revora's own evaluations. */
  quality: number;
  /** 0-100 reliability from recent health: successes, failures, breaker state. */
  reliability: number;
  /** Median latency in ms from recorded calls, or null when unmeasured. */
  latencyMs: number | null;
  /** True when Revora pays per call. Used ONLY as the final tiebreak. */
  paid: boolean;
  /** Estimated USD per million output tokens, when the provider publishes it. */
  costPerMTok: number | null;
  /** True when this model is one of the authoritative specialist six. */
  specialist: boolean;
  /** Provider-declared or Revora-declared domain specializations. */
  specializations: string[];
  languages: string[];
  /** Whether the record's capability data came from a live probe. */
  evidence: "probe" | "provider_metadata" | "declared";
  verifiedAt: number;
  healthy: boolean;
  /** Set when the provider/model is blocked right now (breaker, quota, policy). */
  blockedReason: string | null;
};

export function supports(record: ModelRecord, capability: Capability): boolean {
  return capabilitySatisfied(record.capabilities[capability]);
}

export function missingCapabilities(record: ModelRecord, required: Capability[]): Capability[] {
  return required.filter((capability) => !supports(record, capability));
}
