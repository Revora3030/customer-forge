/**
 * REVORA CAPABILITY REGISTRY (client-safe half).
 *
 * Builder code asks for a *capability* ("research.web", "email.transactional"),
 * never for a vendor. This module owns the honest catalogue: which capabilities
 * exist, which provider can serve each one, which server credentials that
 * provider needs, whether Revora has actually implemented the server-side call
 * for it, and whether a deterministic Revora path can cover it when nothing is
 * connected.
 *
 * Nothing here reads credentials or talks to a provider — it contains no
 * secrets and is safe to import from a component. The runtime half lives in
 * `registry.server.ts`.
 *
 * Honesty rules encoded here:
 *  - `implemented: false` means catalogued only. It can never report "ready",
 *    no matter how many keys are configured.
 *  - `cost: "paid"` providers are never selected while free-only mode is on.
 *  - A capability without a deterministic fallback reports "unavailable"
 *    instead of pretending a text fallback is equivalent (image, voice, SMS).
 */

export type Capability =
  | "ai.text"
  | "ai.vision"
  | "research.web"
  | "research.competitors"
  | "seo.search_console"
  | "seo.analytics"
  | "seo.keywords"
  | "maps.places"
  | "crm.leads"
  | "email.transactional"
  | "messaging.sms"
  | "messaging.whatsapp"
  | "calendar.booking"
  | "media.image"
  | "media.video"
  | "media.voice"
  | "design.assets"
  | "automation.workflows"
  | "observability.errors"
  | "payments"
  | "storage.files";

export type ProviderCost = "free" | "paid" | "included";

/** Who owns the connection: the Revora platform, or the individual customer. */
export type TenantScope = "platform" | "tenant";

export type ProviderDefinition = {
  id: string;
  label: string;
  capabilities: Capability[];
  /** Every one of these server env names must be present to be usable. */
  credentials: string[];
  cost: ProviderCost;
  scope: TenantScope;
  /** True only when Revora has server-side code that actually calls it. */
  implemented: boolean;
  /** Least-privilege note shown in the admin surface. */
  permission: string;
};

export type ProviderStatus =
  /** Implemented and its credentials are present. */
  | "ready"
  /** Implemented, but the credentials are missing. */
  | "needs_connection"
  /** Catalogued only — no server-side call exists yet. */
  | "not_implemented";

export type CapabilityStatus =
  /** An authorized provider can serve it right now. */
  | "ready"
  /** No provider, but Revora's own deterministic path covers it. */
  | "deterministic"
  /** A provider is implemented but not yet authorized. */
  | "needs_connection"
  /** Genuinely cannot be done here, and nothing pretends otherwise. */
  | "unavailable";

export type ProviderSnapshot = ProviderDefinition & {
  status: ProviderStatus;
  /** Credential names that are missing (never values). */
  missing: string[];
  healthy: boolean;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastFailureReason: string | null;
  rateLimitedUntil: number | null;
  /** Set once a real call through Revora has succeeded in this process. */
  runtimeVerified: boolean;
};

export type CapabilitySnapshot = {
  capability: Capability;
  label: string;
  status: CapabilityStatus;
  /** The provider that would serve the next call, when there is one. */
  selected: string | null;
  fallback: string | null;
  deterministic: boolean;
  providers: ProviderSnapshot[];
  detail: string;
};

/** Revora's own deterministic engine, by capability. */
export const DETERMINISTIC_CAPABILITIES: Capability[] = [
  "ai.text",
  "research.web",
  "seo.keywords",
  "crm.leads",
  "storage.files",
];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  "ai.text": "Writing and planning",
  "ai.vision": "Reading pictures",
  "research.web": "Reading a web page",
  "research.competitors": "Competitor research",
  "seo.search_console": "Search Console data",
  "seo.analytics": "Website analytics",
  "seo.keywords": "Keyword ideas",
  "maps.places": "Places and local data",
  "crm.leads": "Leads and contacts",
  "email.transactional": "Sending email",
  "messaging.sms": "Text messages",
  "messaging.whatsapp": "WhatsApp messages",
  "calendar.booking": "Appointments",
  "media.image": "Making images",
  "media.video": "Making video",
  "media.voice": "Making voice audio",
  "design.assets": "Design files",
  "automation.workflows": "Automations",
  "observability.errors": "Error reporting",
  payments: "Payments",
  "storage.files": "File storage",
};

/**
 * The provider catalogue, in resolution order per capability: Revora's own
 * implemented free paths first, then implemented optional providers, then
 * catalogued-only entries (which can never be selected).
 */
export const PROVIDERS: ProviderDefinition[] = [
  {
    id: "revora-ai-router",
    label: "Revora free-AI router",
    capabilities: ["ai.text", "ai.vision"],
    credentials: [],
    cost: "free",
    scope: "platform",
    implemented: true,
    permission: "Server-side only. Free providers first; paid models are rejected in free-only mode.",
  },
  {
    id: "revora-native-fetch",
    label: "Revora native page reader",
    capabilities: ["research.web"],
    credentials: [],
    cost: "free",
    scope: "platform",
    implemented: true,
    permission: "Public pages only, SSRF-guarded, read-only. Source URL kept with every extract.",
  },
  {
    id: "supabase",
    label: "Lovable Cloud (database, auth, storage)",
    capabilities: ["storage.files", "crm.leads"],
    credentials: [],
    cost: "included",
    scope: "platform",
    implemented: true,
    permission: "Row-level security decides every read and write. Tenant isolation is authoritative.",
  },
  {
    id: "stripe",
    label: "Stripe",
    capabilities: ["payments"],
    credentials: ["STRIPE_LIVE_API_KEY"],
    cost: "paid",
    scope: "platform",
    implemented: true,
    permission: "Billing truth for Revora itself. Never used for customer-site commerce.",
  },
  {
    id: "lovable-email",
    label: "Managed email sending",
    capabilities: ["email.transactional"],
    credentials: [],
    cost: "included",
    scope: "platform",
    implemented: true,
    permission: "Transactional sends only, with idempotency keys and provider-confirmed delivery.",
  },
  {
    id: "sentry",
    label: "Sentry",
    capabilities: ["observability.errors"],
    credentials: ["SENTRY_DSN"],
    cost: "free",
    scope: "platform",
    implemented: true,
    permission: "Error events only. No customer database access.",
  },
  {
    id: "firecrawl",
    label: "Firecrawl",
    capabilities: ["research.web", "research.competitors"],
    credentials: ["FIRECRAWL_API_KEY"],
    cost: "paid",
    scope: "platform",
    implemented: true,
    permission: "Read-only page extraction. Source URL and fetch time stored with every result.",
  },
  {
    id: "google-maps",
    label: "Google Maps Platform",
    capabilities: ["maps.places"],
    credentials: ["GOOGLE_MAPS_API_KEY"],
    cost: "paid",
    scope: "platform",
    implemented: false,
    permission: "Server key through the connector gateway only; never called from the browser.",
  },
  {
    id: "google-search-console",
    label: "Google Search Console",
    capabilities: ["seo.search_console"],
    credentials: ["GOOGLE_SEARCH_CONSOLE_SITE_URL", "GOOGLE_SERVICE_ACCOUNT_JSON"],
    cost: "free",
    scope: "tenant",
    implemented: false,
    permission: "Read-only search performance for a site the customer has authorized.",
  },
  {
    id: "google-analytics",
    label: "Google Analytics",
    capabilities: ["seo.analytics"],
    credentials: ["GOOGLE_ANALYTICS_PROPERTY_ID", "GOOGLE_SERVICE_ACCOUNT_JSON"],
    cost: "free",
    scope: "tenant",
    implemented: false,
    permission: "Read-only reporting for a property the customer has authorized.",
  },
  {
    id: "semrush",
    label: "Semrush",
    capabilities: ["seo.keywords", "research.competitors"],
    credentials: ["SEMRUSH_API_KEY"],
    cost: "paid",
    scope: "platform",
    implemented: false,
    permission: "Read-only keyword and competitor data. Never presented as a guarantee.",
  },
  {
    id: "n8n",
    label: "n8n",
    capabilities: ["automation.workflows"],
    credentials: ["N8N_BASE_URL", "N8N_WEBHOOK_SECRET"],
    cost: "free",
    scope: "tenant",
    implemented: true,
    permission: "Signed outbound event notifications only. Never a source of truth.",
  },
  {
    id: "hubspot",
    label: "HubSpot",
    capabilities: ["crm.leads"],
    credentials: ["HUBSPOT_ACCESS_TOKEN"],
    cost: "free",
    scope: "tenant",
    implemented: false,
    permission: "Contacts the customer authorizes. Revora's own lead table stays authoritative.",
  },
  {
    id: "twilio",
    label: "Twilio",
    capabilities: ["messaging.sms", "messaging.whatsapp"],
    credentials: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    cost: "paid",
    scope: "tenant",
    implemented: false,
    permission: "Opt-in recipients only. Delivery reported only when the provider confirms it.",
  },
  {
    id: "google-calendar",
    label: "Google Calendar",
    capabilities: ["calendar.booking"],
    credentials: ["GOOGLE_CALENDAR_CREDENTIALS"],
    cost: "free",
    scope: "tenant",
    implemented: false,
    permission: "Availability and bookings for a calendar the customer authorizes.",
  },
  {
    id: "calendly",
    label: "Calendly",
    capabilities: ["calendar.booking"],
    credentials: ["CALENDLY_ACCESS_TOKEN"],
    cost: "free",
    scope: "tenant",
    implemented: false,
    permission: "Read booking events for the customer's own Calendly account.",
  },
  {
    id: "replicate",
    label: "Replicate",
    capabilities: ["media.image", "media.video"],
    credentials: ["REPLICATE_API_TOKEN"],
    cost: "paid",
    scope: "platform",
    implemented: false,
    permission: "Generation only. Blocked while free-only mode is on, because it bills per run.",
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    capabilities: ["media.voice"],
    credentials: ["ELEVENLABS_API_KEY"],
    cost: "paid",
    scope: "platform",
    implemented: false,
    permission: "Voice rendering only. Blocked while free-only mode is on.",
  },
  {
    id: "canva",
    label: "Canva",
    capabilities: ["design.assets"],
    credentials: ["CANVA_ACCESS_TOKEN"],
    cost: "free",
    scope: "tenant",
    implemented: false,
    permission: "Read the customer's own design assets. No write-back.",
  },
];

export const ALL_CAPABILITIES = Object.keys(CAPABILITY_LABELS) as Capability[];

export function providersFor(capability: Capability): ProviderDefinition[] {
  return PROVIDERS.filter((provider) => provider.capabilities.includes(capability));
}

/** True when a capability has a deterministic Revora path if nothing is connected. */
export function hasDeterministicPath(capability: Capability): boolean {
  return DETERMINISTIC_CAPABILITIES.includes(capability);
}

/**
 * The provider Revora would use next, given what is configured. Pure so the
 * same decision can be checked without any environment.
 */
export function selectProvider(
  capability: Capability,
  ready: (providerId: string) => boolean,
  options: { freeOnly: boolean } = { freeOnly: true },
): ProviderDefinition | null {
  for (const provider of providersFor(capability)) {
    if (!provider.implemented) continue;
    if (options.freeOnly && provider.cost === "paid") continue;
    if (!ready(provider.id)) continue;
    return provider;
  }
  return null;
}

export function capabilityStatus(input: {
  capability: Capability;
  selected: ProviderDefinition | null;
  anyImplemented: boolean;
}): CapabilityStatus {
  if (input.selected) return "ready";
  if (hasDeterministicPath(input.capability)) return "deterministic";
  if (input.anyImplemented) return "needs_connection";
  return "unavailable";
}

export const CAPABILITY_STATUS_LABELS: Record<CapabilityStatus, string> = {
  ready: "Ready",
  deterministic: "Revora's own engine",
  needs_connection: "Needs connection",
  unavailable: "Not available here",
};
