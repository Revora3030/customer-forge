export type EvidenceState = "verified" | "partial" | "unverified";

export type ReadinessDomain =
  | "tenantIsolation"
  | "authentication"
  | "publishing"
  | "generatedSite"
  | "rollback"
  | "observability"
  | "backupRestore"
  | "activation"
  | "accessibility"
  | "performance"
  | "seo"
  | "billing";

export type Evidence = Record<ReadinessDomain, EvidenceState>;

export type ReleaseRisk = "low" | "medium" | "high" | "critical";

export type PublicationCheck =
  | "route-integrity"
  | "meaningful-content"
  | "placeholder-free"
  | "conversion-destination"
  | "metadata"
  | "accessibility"
  | "mobile-layout"
  | "resources"
  | "runtime"
  | "performance"
  | "tenant-safety"
  | "seo";

export type PublicationResult = {
  publishable: boolean;
  blocking: string[];
  warnings: string[];
};

export type ActivationEvent =
  | "visitor"
  | "account_created"
  | "trial_started"
  | "trial_active"
  | "paid_customer";

const DOMAIN_LABELS: Record<ReadinessDomain, string> = {
  tenantIsolation: "tenant isolation",
  authentication: "authentication",
  publishing: "publishing",
  generatedSite: "generated-site verification",
  rollback: "rollback",
  observability: "observability",
  backupRestore: "backup/restore",
  activation: "activation measurement",
  accessibility: "accessibility",
  performance: "performance",
  seo: "SEO",
  billing: "billing",
};

export function evaluateEvidence(evidence: Evidence) {
  const entries = Object.entries(evidence) as [ReadinessDomain, EvidenceState][];
  const blockers = entries
    .filter(([, state]) => state !== "verified")
    .map(([domain, state]) => `${DOMAIN_LABELS[domain]}: ${state}`);
  return {
    ready: blockers.length === 0,
    verified: entries.filter(([, state]) => state === "verified").length,
    partial: entries.filter(([, state]) => state === "partial").length,
    unverified: entries.filter(([, state]) => state === "unverified").length,
    blockers,
  };
}

export function classifyReleaseRisk(input: {
  destructive?: boolean;
  changesTenantBoundary?: boolean;
  changesAuth?: boolean;
  changesBilling?: boolean;
  changesSchema?: boolean;
  changesPublishing?: boolean;
  actionCount?: number;
}): ReleaseRisk {
  if (input.destructive || input.changesTenantBoundary || input.changesBilling) return "critical";
  if (input.changesAuth || input.changesSchema || input.changesPublishing) return "high";
  if ((input.actionCount ?? 0) >= 20) return "medium";
  return "low";
}

export function requiresRollbackEvidence(risk: ReleaseRisk) {
  return risk === "high" || risk === "critical";
}

export function evaluatePublication(input: Partial<Record<PublicationCheck, boolean>>): PublicationResult {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const required: PublicationCheck[] = [
    "route-integrity",
    "meaningful-content",
    "placeholder-free",
    "conversion-destination",
    "metadata",
    "accessibility",
    "mobile-layout",
    "resources",
    "runtime",
    "performance",
    "tenant-safety",
  ];

  for (const check of required) {
    if (input[check] === false || input[check] === undefined) {
      blocking.push(check);
    }
  }

  if (input["seo"] === false) warnings.push("seo");
  return { publishable: blocking.length === 0, blocking, warnings };
}

export function canonicalActivationEvent(input: {
  stage: ActivationEvent;
  userId?: string | null;
  organizationId?: string | null;
  eventId: string;
}) {
  const scoped = input.organizationId ?? input.userId ?? null;
  if (!input.eventId.trim() || !scoped) return null;
  return {
    eventId: input.eventId.trim(),
    stage: input.stage,
    subjectId: scoped,
  };
}

export function redactSensitiveText(value: string) {
  return value
    .replace(/sk_(?:live|test)_[A-Za-z0-9_\-]+/g, "[REDACTED_STRIPE_KEY]")
    .replace(/whsec_[A-Za-z0-9_\-]+/g, "[REDACTED_WEBHOOK_SECRET]")
    .replace(/sb_secret_[A-Za-z0-9_\-]+/g, "[REDACTED_SUPABASE_SECRET]")
    .replace(/AIza[0-9A-Za-z_\-]+/g, "[REDACTED_GOOGLE_KEY]")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]")
    .replace(/SUPABASE_SERVICE_ROLE_KEY\s*[=:]\s*[^\s,;]+/gi, "SUPABASE_SERVICE_ROLE_KEY=[REDACTED]");
}

export function assertSafeTelemetryDimensions(input: Record<string, unknown>) {
  const forbidden = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|prompt|content|email|phone|address/i;
  return Object.keys(input).filter((key) => forbidden.test(key));
}

export function evaluateTenantOperation(input: {
  authenticated: boolean;
  requestedOrganizationId?: string | null;
  membershipOrganizationId?: string | null;
  serverPrivileged?: boolean;
}) {
  if (input.serverPrivileged) return { allowed: true, reason: "server-privileged" as const };
  if (!input.authenticated) return { allowed: false, reason: "unauthenticated" as const };
  if (!input.requestedOrganizationId || !input.membershipOrganizationId) {
    return { allowed: false, reason: "missing-tenant-context" as const };
  }
  if (input.requestedOrganizationId !== input.membershipOrganizationId) {
    return { allowed: false, reason: "cross-tenant" as const };
  }
  return { allowed: true, reason: "member" as const };
}

export const PRODUCTION_CONTROL_UPGRADES = [
  "evidence-gated releases",
  "risk-aware rollback requirements",
  "publication hard blockers",
  "placeholder-content blocking",
  "conversion-path blocking",
  "runtime-verification boundary",
  "tenant-boundary enforcement contract",
  "canonical activation events",
  "idempotent activation identity",
  "secret-safe telemetry",
  "credential redaction",
  "billing release guard",
  "schema release guard",
  "authentication release guard",
  "mobile publication gate",
  "accessibility publication gate",
  "SEO publication gate",
  "performance publication gate",
  "resource integrity gate",
  "route integrity gate",
  "observability contract",
  "backup/restore evidence contract",
  "incident rollback contract",
  "generated-site QA contract",
  "cross-tenant adversarial test contract",
  "browser-agent evidence boundary",
  "deterministic quality gate",
  "no-inference runtime policy",
] as const;
