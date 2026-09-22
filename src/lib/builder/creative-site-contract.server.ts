import { callBestThinker } from "@/lib/ai/hall-of-fame.server";
import {
  CREATIVE_SITE_AUTHORITY,
  CREATIVE_SITE_CONTRACT_VERSION,
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
  };

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
      "Create the complete site contract now.",
      "The site may have any valid number of pages and sections needed by the business.",
      "Do not include claims not present in the facts.",
      "Use stable ids such as page-home and section-home-intro-01, but invent the actual architecture.",
    ].join("\n"),
  });

  if (!sol.ok || !sol.text)
    return {
      contract: null,
      reviewed: false,
      skipped: sol.detail ?? sol.reason,
      models: [],
      costMicrocents: 0,
    };

  const parsed = parseJson(sol.text);
  if (!parsed)
    return {
      contract: null,
      reviewed: false,
      skipped: "Sol returned invalid JSON",
      models: sol.model ? [sol.model] : [],
      costMicrocents: sol.costMicrocents,
    };

  let contract = normalize(parsed, sol.model ?? "gpt-5.6-sol");
  let validation = validateCreativeSiteContract(contract);
  if (!validation.valid) {
    return {
      contract: null,
      reviewed: false,
      skipped: validation.violations.slice(0, 8).join("; "),
      models: sol.model ? [sol.model] : [],
      costMicrocents: sol.costMicrocents,
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
      models: [sol.model].filter(Boolean) as string[],
      costMicrocents: sol.costMicrocents,
    };

  const repaired = parseJson(terra.text);
  if (!repaired)
    return {
      contract: null,
      reviewed: false,
      skipped: "Terra returned invalid JSON",
      models: [sol.model, terra.model].filter(Boolean) as string[],
      costMicrocents: sol.costMicrocents + terra.costMicrocents,
    };

  contract = normalize(repaired, sol.model ?? "gpt-5.6-sol");
  contract.reviewedBy = terra.model ?? "gpt-5.6-terra";
  validation = validateCreativeSiteContract(contract);
  if (!validation.valid)
    return {
      contract: null,
      reviewed: true,
      skipped: validation.violations.slice(0, 8).join("; "),
      models: [sol.model, terra.model].filter(Boolean) as string[],
      costMicrocents: sol.costMicrocents + terra.costMicrocents,
    };

  return {
    contract,
    reviewed: true,
    skipped: null,
    models: [sol.model, terra.model].filter(Boolean) as string[],
    costMicrocents: sol.costMicrocents + terra.costMicrocents,
  };
}
