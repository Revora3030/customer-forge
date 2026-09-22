import { callBestThinker } from "@/lib/ai/hall-of-fame.server";
import {
  CREATIVE_SITE_AUTHORITY,
  CREATIVE_SITE_CONTRACT_VERSION,
  mergeCreativeSiteContracts,
  validateCreativeSiteContract,
  type CreativeSiteContract,
} from "@/lib/builder/creative-site-contract";

export type CreativeSiteContractOutcome = {
  contract: CreativeSiteContract | null;
  reviewed: boolean;
  skipped: string | null;
  models: string[];
  costMicrocents: number;
};

const SYSTEM = [
  "You are Sol, the sole creative director and website architect.",
  "Author the complete website, not a refinement of a scaffold.",
  "You may invent page names, section roles, layouts, typography, color systems, responsive behavior, motion, interactions and visual concepts.",
  "Do not choose from a supplied vocabulary and do not use template/preset identifiers.",
  "Use only supplied business facts for factual claims, services, prices, contact details, locations and proof.",
  "Creative values are open-ended strings/objects. Never encode CSS/HTML/JavaScript execution.",
  "Every page and section must have a stable id. Each page may have a completely different composition.",
  "Responsive behavior is authored per section. Do not assume a mobile autopilot.",
  "If a requested visual or interaction cannot be represented safely, describe it in the contract rather than silently replacing it.",
  "Return one complete JSON object matching the CreativeSiteContract shape.",
].join(" ");

function parseJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value: unknown = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function normalize(raw: Record<string, unknown>, model: string): CreativeSiteContract {
  return {
    ...(raw as unknown as CreativeSiteContract),
    version: CREATIVE_SITE_CONTRACT_VERSION,
    revision: Number(raw.revision) > 0 ? Number(raw.revision) : 1,
    authority: CREATIVE_SITE_AUTHORITY,
    directedBy: typeof raw.directedBy === "string" ? raw.directedBy : model,
    reviewedBy: typeof raw.reviewedBy === "string" ? raw.reviewedBy : null,
    complete: raw.complete !== false,
    pages: Array.isArray(raw.pages) ? (raw.pages as CreativeSiteContract["pages"]) : [],
  };
}

export async function authorCreativeSiteContract(input: {
  organizationId: string;
  businessName: string;
  industry: string | null;
  description: string | null;
  services: Array<{ name: string; description?: string | null; price?: number | null; starting_price?: number | null }>;
  location: string | null;
  serviceArea: string | null;
  phone: string | null;
  email: string | null;
  goals: string[];
  conversionGoal: string;
  hasQuoteForm: boolean;
  hasBooking: boolean;
  language: string;
  hasOwnerMedia: boolean;
  signal?: AbortSignal;
}): Promise<CreativeSiteContractOutcome> {
  const facts = {
    businessName: input.businessName,
    industry: input.industry,
    description: input.description,
    services: input.services,
    location: input.location,
    serviceArea: input.serviceArea,
    phone: input.phone,
    email: input.email,
    goals: input.goals,
    conversionGoal: input.conversionGoal,
    hasQuoteForm: input.hasQuoteForm,
    hasBooking: input.hasBooking,
    language: input.language,
    hasOwnerMedia: input.hasOwnerMedia,
  };

  let solModel = "gpt-5.6-sol";
  let solCostMicrocents = 0;
  let contract: CreativeSiteContract | null = null;
  let continuation = { chunkIndex: 0, totalChunks: undefined as number | undefined, cursor: null as string | null, hasMore: false };

  // Large websites are authored in resumable chunks. Each chunk is a
  // complete JSON contract fragment with stable page/section IDs, and the
  // fragments are merged by ID before Terra sees the site.
  for (let chunkIndex = 0; chunkIndex < 12; chunkIndex += 1) {
    const sol = await callBestThinker({
      purpose: "creative_direction",
      complexity: "high",
      organizationId: input.organizationId,
      json: true,
      maxOutputTokens: 12000,
      ...(input.signal ? { signal: input.signal } : {}),
      system: SYSTEM,
      user: [
        "BUSINESS FACTS:",
        JSON.stringify(facts, null, 2),
        "",
        chunkIndex === 0
          ? "Create the complete site contract now."
          : [
              "Continue the same website contract from the previous chunk.",
              "Do not redesign or overwrite existing pages/sections. Add only missing pages/sections/components and any additional identity data required to complete the site.",
              "Previous chunk index: " + continuation.chunkIndex + ". Cursor: " + (continuation.cursor ?? "none") + ".",
              "Return stable IDs so the chunks can be merged without loss.",
              "Set continuation.hasMore=true only when another chunk is actually required; otherwise set hasMore=false.",
              "Return one CreativeSiteContract JSON object only.",
            ].join("\n"),
        "The site may have any valid number of pages and sections needed by the business.",
        "Do not include claims not present in the facts.",
        input.hasOwnerMedia
          ? "Owner media exists; you may assign it where useful, but do not invent asset ids."
          : "No owner media is available; do not mark any section media as required unless the contract can materialize a real asset.",
        "Use stable ids such as page-home and section-home-intro-01, but invent the actual architecture.",
        contract ? "CURRENT MERGED CONTRACT:\n" + JSON.stringify(contract) : "",
      ].filter(Boolean).join("\n"),
    });

    if (!sol.ok || !sol.text) {
      return {
        contract: null,
        reviewed: false,
        skipped: sol.detail ?? sol.reason,
        models: [solModel].filter(Boolean),
        costMicrocents: solCostMicrocents,
      };
    }

    solModel = sol.model ?? solModel;
    solCostMicrocents += sol.costMicrocents;
    const parsedChunk = parseJson(sol.text);
    if (!parsedChunk) {
      return {
        contract: null,
        reviewed: false,
        skipped: "Sol returned invalid JSON in chunk " + (chunkIndex + 1),
        models: [solModel],
        costMicrocents: solCostMicrocents,
      };
    }

    const chunk = normalize(parsedChunk, solModel);
    const chunkValidation = validateCreativeSiteContract(chunk);
    if (!chunkValidation.valid) {
      return {
        contract: null,
        reviewed: false,
        skipped: chunkValidation.violations.slice(0, 8).join("; "),
        models: [solModel],
        costMicrocents: solCostMicrocents,
      };
    }

    contract = contract ? mergeCreativeSiteContracts(contract, chunk) : chunk;
    continuation = {
      chunkIndex,
      totalChunks: chunk.continuation?.totalChunks,
      cursor: chunk.continuation?.cursor ?? null,
      hasMore: chunk.continuation?.hasMore === true,
    };
    if (!continuation.hasMore) break;
    if (chunkIndex === 11) {
      return {
        contract: null,
        reviewed: false,
        skipped: "Sol required more than the supported continuation window",
        models: [solModel],
        costMicrocents: solCostMicrocents,
      };
    }
  }

  if (!contract) {
    return {
      contract: null,
      reviewed: false,
      skipped: "Sol did not produce a complete site contract",
      models: [solModel],
      costMicrocents: solCostMicrocents,
    };
  }

  contract = {
    ...contract,
    continuation: {
      chunkIndex: continuation.chunkIndex,
      totalChunks: continuation.totalChunks,
      cursor: continuation.cursor,
      hasMore: false,
    },
    complete: true,
  };
  const finalValidation = validateCreativeSiteContract(contract);
  if (!finalValidation.valid) {
    return {
      contract: null,
      reviewed: false,
      skipped: finalValidation.violations.slice(0, 8).join("; "),
      models: [solModel],
      costMicrocents: solCostMicrocents,
    };
  }
  const terra = await callBestThinker({
    purpose: "quality_review",
    complexity: "high",
    organizationId: input.organizationId,
    json: true,
    maxOutputTokens: 12000,
    ...(input.signal ? { signal: input.signal } : {}),
    system: [
      "You are Terra, an adversarial senior reviewer.",
      "Review the supplied AI-authored website contract for truth, broken references, missing content, accessibility, unsafe values and structural integrity.",
      "Do not impose a preferred aesthetic, hero pattern, page anatomy, section vocabulary or conversion pattern.",
      "If repair is required, return the COMPLETE repaired CreativeSiteContract. Preserve valid creative decisions instead of replacing them with a template.",
      "If it is valid, return the COMPLETE contract unchanged with reviewedBy set to Terra.",
      "Return JSON only.",
    ].join(" "),
    user: [
      "BUSINESS FACTS:",
      JSON.stringify(facts, null, 2),
      "",
      "SOL CONTRACT:",
      JSON.stringify(contract),
    ].join("\n"),
  });

  if (!terra.ok || !terra.text)
    return {
      contract: null,
      reviewed: false,
      skipped: terra.detail ?? terra.reason ?? "Terra review unavailable",
      models: [solModel].filter(Boolean) as string[],
      costMicrocents: solCostMicrocents,
    };

  const repaired = parseJson(terra.text);
  if (!repaired)
    return {
      contract: null,
      reviewed: false,
      skipped: "Terra returned invalid JSON",
      models: [solModel, terra.model].filter(Boolean) as string[],
      costMicrocents: solCostMicrocents + terra.costMicrocents,
    };

  contract = normalize(repaired, solModel);
  contract.reviewedBy = terra.model ?? "gpt-5.6-terra";
  const terraValidation = validateCreativeSiteContract(contract);
  if (!terraValidation.valid)
    return {
      contract: null,
      reviewed: true,
      skipped: terraValidation.violations.slice(0, 8).join("; "),
      models: [solModel, terra.model].filter(Boolean) as string[],
      costMicrocents: solCostMicrocents + terra.costMicrocents,
    };

  return {
    contract,
    reviewed: true,
    skipped: null,
    models: [solModel, terra.model].filter(Boolean) as string[],
    costMicrocents: solCostMicrocents + terra.costMicrocents,
  };
}
