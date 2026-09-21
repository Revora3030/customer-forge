/**
 * Revora AI Orchestrator — shared, browser-safe types.
 *
 * The orchestrator runs specialised passes over the information the client
 * supplied (business intelligence, customer intent, conversion architecture)
 * and stores the result as a "brief". The brief is the single shared business
 * context every later pass — structure, copy, SEO, forms — reads from, so the
 * finished website is one coherent asset instead of disconnected AI sections.
 *
 * Nothing here invents facts. Every field is either derived from what the
 * client entered or explicitly listed under `missingFacts`.
 */

import type { CaptureCheck } from "@/lib/launch-qa";

export type CustomerIntent =
  | "ready_to_book"
  | "ready_to_call"
  | "wants_price"
  | "researching"
  | "comparing"
  | "local_search"
  | "returning";

export const INTENT_META: Record<CustomerIntent, { label: string; path: string }> = {
  ready_to_book: { label: "Ready to book", path: "Send them straight to online booking." },
  ready_to_call: { label: "Ready to call", path: "Keep the phone number visible on every screen." },
  wants_price: {
    label: "Wants a price",
    path: "Lead with the quote calculator and starting prices.",
  },
  researching: { label: "Researching services", path: "Give clear service detail and FAQs." },
  comparing: { label: "Comparing providers", path: "Show proof, process and what's included." },
  local_search: { label: "Looking locally", path: "Make the service area obvious." },
  returning: { label: "Returning customer", path: "Make rebooking and contact one tap away." },
};

export type SiteBrief = {
  /** One sentence describing what the business does, in plain language. */
  positioning: string;
  /** Who the website is written for. */
  buyer: string;
  /** What the buyer is trying to get done. */
  buyerGoal: string;
  intents: CustomerIntent[];
  primaryAction: string;
  secondaryAction: string;
  /** Real objections a buyer in this category raises. */
  objections: string[];
  /** What the page has to prove before someone enquires. */
  trustNeeds: string[];
  /** Only the fields worth asking for on the lead form. */
  qualifyingFields: string[];
  /** Page keys the orchestrator considers highest value, in order. */
  pagePriorities: string[];
  toneNotes: string;
  /** Facts the site would be stronger with — never guessed, only requested. */
  missingFacts: string[];
  /** Which model produced the brief, or "rules" for the deterministic fallback. */
  source: string;
  /** The owner reviewed (and possibly edited) this brief and approved the build. */
  approved: boolean;
  /** Answers the owner gave to Revora's questions, kept with the brief. */
  factAnswers: Record<string, string>;
};

const strings = (value: unknown, max: number, cap = 160) =>
  (Array.isArray(value) ? value : [])
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim().slice(0, cap))
    .slice(0, max);

const text = (value: unknown, fallback: string, cap = 240) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, cap) : fallback;

export function readBrief(value: unknown): SiteBrief | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw["positioning"] !== "string") return null;
  const intents = strings(raw["intents"], 7, 40).filter(
    (i): i is CustomerIntent => i in INTENT_META,
  );
  return {
    positioning: text(raw["positioning"], ""),
    buyer: text(raw["buyer"], ""),
    buyerGoal: text(raw["buyerGoal"], ""),
    intents: intents.length ? intents : ["wants_price"],
    primaryAction: text(raw["primaryAction"], "Get a quote", 40),
    secondaryAction: text(raw["secondaryAction"], "See services", 40),
    objections: strings(raw["objections"], 5),
    trustNeeds: strings(raw["trustNeeds"], 5),
    qualifyingFields: strings(raw["qualifyingFields"], 8, 60),
    pagePriorities: strings(raw["pagePriorities"], 8, 40),
    toneNotes: text(raw["toneNotes"], ""),
    missingFacts: strings(raw["missingFacts"], 6),
    source: text(raw["source"], "rules", 60),
    approved: raw["approved"] === true,
    factAnswers: readAnswers(raw["factAnswers"]),
  };
}

function readAnswers(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
    if (typeof v === "string" && v.trim()) out[key.slice(0, 60)] = v.trim().slice(0, 600);
  }
  return out;
}

/* ------------------------------- build report ------------------------------- */

export type BuildReport = {
  builtAt: string;
  pages: number;
  sections: number;
  services: number;
  faqs: number;
  photos: number;
  leadForms: number;
  bookableServices: number;
  seoConfigured: boolean;
  crmConnected: boolean;
  crmStatus?: "connected_internal" | "not_connected" | "not_tested";
  crmMessage?: string | null;
  analyticsConfigured: boolean;
  imagery?: {
    status?: string;
    generatedStatus?: string;
    generated?: number;
    attached?: number;
    provider?: string | null;
    models?: string[];
    message?: string | null;
  } | null;
  firstPreviewGate?: {
    content?: string;
    browser?: string;
    visual?: string;
    mobile?: string;
    performance?: string;
    ready?: boolean;
    reason?: string | null;
  } | null;
  briefSource: string;
  copyModel: string;
  /** Lead-capture and booking QA results from the build run. */
  checks: CaptureCheck[];
  /** Plain-language items the owner still needs to handle. */
  attention: string[];
};

export function readReport(value: unknown): BuildReport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw["builtAt"] !== "string") return null;
  const num = (key: string) => (typeof raw[key] === "number" ? (raw[key] as number) : 0);
  return {
    builtAt: raw["builtAt"] as string,
    pages: num("pages"),
    sections: num("sections"),
    services: num("services"),
    faqs: num("faqs"),
    photos: num("photos"),
    leadForms: num("leadForms"),
    bookableServices: num("bookableServices"),
    seoConfigured: raw["seoConfigured"] === true,
    crmConnected: raw["crmConnected"] === true,
    crmStatus:
      raw["crmStatus"] === "connected_internal" ||
      raw["crmStatus"] === "not_connected" ||
      raw["crmStatus"] === "not_tested"
        ? raw["crmStatus"]
        : raw["crmConnected"] === true
          ? "connected_internal"
          : "not_connected",
    crmMessage: text(raw["crmMessage"], "", 240) || null,
    analyticsConfigured: raw["analyticsConfigured"] === true,
    imagery:
      raw["imagery"] && typeof raw["imagery"] === "object" && !Array.isArray(raw["imagery"])
        ? {
            status: text((raw["imagery"] as Record<string, unknown>)["status"], "", 60),
            generatedStatus: text((raw["imagery"] as Record<string, unknown>)["generatedStatus"], "", 60),
            generated: numFrom(raw["imagery"], "generated"),
            attached: numFrom(raw["imagery"], "attached"),
            provider: text((raw["imagery"] as Record<string, unknown>)["provider"], "", 80) || null,
            models: strings((raw["imagery"] as Record<string, unknown>)["models"], 8, 100),
            message: text((raw["imagery"] as Record<string, unknown>)["message"], "", 240) || null,
          }
        : null,
    firstPreviewGate:
      raw["firstPreviewGate"] && typeof raw["firstPreviewGate"] === "object" && !Array.isArray(raw["firstPreviewGate"])
        ? {
            content: text((raw["firstPreviewGate"] as Record<string, unknown>)["content"], "", 40),
            browser: text((raw["firstPreviewGate"] as Record<string, unknown>)["browser"], "", 40),
            visual: text((raw["firstPreviewGate"] as Record<string, unknown>)["visual"], "", 40),
            mobile: text((raw["firstPreviewGate"] as Record<string, unknown>)["mobile"], "", 40),
            performance: text((raw["firstPreviewGate"] as Record<string, unknown>)["performance"], "", 40),
            ready: (raw["firstPreviewGate"] as Record<string, unknown>)["ready"] === true,
            reason: text((raw["firstPreviewGate"] as Record<string, unknown>)["reason"], "", 240) || null,
          }
        : null,
    briefSource: text(raw["briefSource"], "rules", 60),
    copyModel: text(raw["copyModel"], "", 60),
    checks: Array.isArray(raw["checks"]) ? (raw["checks"] as CaptureCheck[]).slice(0, 20) : [],
    attention: strings(raw["attention"], 8, 200),
  };
}

function numFrom(value: unknown, key: string): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}
