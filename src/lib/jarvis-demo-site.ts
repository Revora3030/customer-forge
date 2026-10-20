import { parseSiteGaps, type SiteGap } from "./prospect-finder";
/**
 * Input contract for Jarvis prospect demo sites.
 *
 * A prospect demo is a private draft website Jarvis builds for a real business
 * that has no website yet, so the operator can show it to the owner. Only facts
 * the operator supplies are stored; nothing is invented, and the AI team writes
 * every creative choice during the normal first build.
 */

export const MAX_DEMO_SERVICES = 8;
export const DEMO_PREVIEW_DAYS = 30;

export type ProspectDemoInput = {
  businessName: string;
  industry: string;
  city: string;
  state: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  services: string[];
  /** Google Maps place ID, when the facts came from a listing; its photos are used first. */
  placeId?: string | null;
  /** Verified gaps on the business's current website, when it has one. */
  siteGaps?: SiteGap[];
};

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const optional = (value: unknown, max: number) => text(value, max) || null;

/** Splits a free-text list ("Drain cleaning, Water heaters\nLeak repair") into service names. */
export function parseServiceList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,;]+/) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const name = text(item, 80);
    const key = name.toLowerCase();
    if (name.length < 3 || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_DEMO_SERVICES) break;
  }
  return out;
}

/** Validates operator input. Throws a plain-language error for the first problem found. */
export function parseProspectDemoInput(input: unknown): ProspectDemoInput {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const businessName = text(raw["businessName"], 120);
  if (businessName.length < 2) throw new Error("Enter the business name.");
  const industry = text(raw["industry"], 80);
  if (industry.length < 3) throw new Error("Enter the business's trade or category.");
  const city = text(raw["city"], 80);
  if (city.length < 2) throw new Error("Enter the city the business serves.");

  const phone = optional(raw["phone"], 40);
  if (phone && phone.replace(/\D/g, "").length < 7) throw new Error("Enter a full phone number, or leave it blank.");
  const email = optional(raw["email"], 160)?.toLowerCase() ?? null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email, or leave it blank.");

  const description = optional(raw["description"], 600);
  const services = parseServiceList(raw["services"]);
  // Same bar as a customer's own first build: real services, or a real description.
  if (services.length === 0 && (description ?? "").length < 12)
    throw new Error("Add at least one real service, or describe what the business does.");

  return {
    businessName,
    industry,
    city,
    state: optional(raw["state"], 40),
    phone,
    email,
    description,
    services,
    placeId: typeof raw["placeId"] === "string" && /^[A-Za-z0-9_-]{10,300}$/.test(raw["placeId"]) ? raw["placeId"] : null,
    ...(parseSiteGaps(raw["siteGaps"]).length ? { siteGaps: parseSiteGaps(raw["siteGaps"]) } : {}),
  };
}

/** Marker stored in website_settings.generation so demos can be listed and later claimed. */
export type ProspectDemoMarker = {
  kind: "prospect_demo";
  createdBy: string;
  createdAt: string;
  previewToken: string;
};

export function readProspectDemoMarker(value: unknown): ProspectDemoMarker | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw["kind"] !== "prospect_demo") return null;
  const createdBy = typeof raw["createdBy"] === "string" ? raw["createdBy"] : "";
  const createdAt = typeof raw["createdAt"] === "string" ? raw["createdAt"] : "";
  const previewToken = typeof raw["previewToken"] === "string" ? raw["previewToken"] : "";
  if (!createdBy || !createdAt || !/^[A-Za-z0-9_-]{16,}$/.test(previewToken)) return null;
  return { kind: "prospect_demo", createdBy, createdAt, previewToken };
}
