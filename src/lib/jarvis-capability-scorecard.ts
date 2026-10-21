/**
 * Evidence-backed scorecard for Jarvis's seven operational capability areas.
 *
 * Configured code is not verified production behavior. Missing, stale, partial,
 * or indirect evidence never counts as a pass. This module scores evidence; it
 * does not grant permission or enable automation.
 */
/**
 * not_run: the check was skipped, cancelled or neutral on the scored commit. It
 * scores like unknown: it never passes and is not reported as a failure.
 */
export type JarvisCapabilityEvidenceStatus = "verified" | "failed" | "unknown" | "configured" | "not_run";

export type JarvisCapabilityEvidence = {
  status: JarvisCapabilityEvidenceStatus;
  summary: string;
  source?: string;
  checkedAt?: string;
};

const definitions = [
  { id: "diagnostics", title: "Diagnostics and system awareness", checks: [
    ["diagnostics.errorSample", "Recent error sample available"],
    ["diagnostics.builderHealth", "Build and publishing health available"],
    ["diagnostics.schemaProbe", "Database API contracts probed"],
    ["diagnostics.redaction", "Redaction verified against adversarial fixtures"],
  ] },
  { id: "engineering", title: "Development and troubleshooting", checks: [
    ["engineering.typecheck", "Typecheck passed on the scored commit"],
    ["engineering.lint", "Lint passed on the scored commit"],
    ["engineering.tests", "Full test suite passed on the scored commit"],
    ["engineering.security", "Security gates passed on the scored commit"],
    ["engineering.browser", "Browser journey passed on the scored commit"],
  ] },
  { id: "growth", title: "Business-growth intelligence", checks: [
    ["growth.funnelSignals", "Funnel metrics are available and defined"],
    ["growth.offerConsistency", "Published offer matches checkout/provider pricing"],
    ["growth.attribution", "Paid conversion attribution has trusted evidence"],
    ["growth.experiments", "Experiments have controlled measurement and outcomes"],
  ] },
  { id: "acquisition", title: "Lead scoring and acquisition tracking", checks: [
    ["acquisition.scoring", "Lead scores are explainable and input-validated"],
    ["acquisition.consent", "Consent evidence is channel-specific and timestamped"],
    ["acquisition.suppression", "Opt-outs, bounces, complaints, and customers are suppressed"],
    ["acquisition.delivery", "Delivery receipts and failures are durably reconciled"],
    ["acquisition.paidConversion", "Lead-to-paid conversion attribution is verified"],
  ] },
  { id: "autonomy", title: "Autonomous execution", checks: [
    ["autonomy.killSwitch", "Durable kill switch is checked at execution time"],
    ["autonomy.approvalConsumption", "Approval is atomically consumed before writes"],
    ["autonomy.idempotency", "Duplicate and concurrent execution is fenced"],
    ["autonomy.postconditions", "Results are independently verified after execution"],
    ["autonomy.recovery", "Retries, leases, and dead-letter recovery are exercised"],
  ] },
  { id: "safety", title: "Safety and access governance", checks: [
    ["safety.superAdminBoundary", "Admin authorization is enforced server-side"],
    ["safety.tenantIsolation", "Cross-tenant negative tests pass"],
    ["safety.redaction", "Secrets and personal data are redacted in outputs"],
    ["safety.audit", "Security-sensitive actions produce append-only audit events"],
    ["safety.secretBoundary", "The model cannot retrieve raw credentials or service keys"],
  ] },
  { id: "reliability", title: "Verified production reliability", checks: [
    ["reliability.ciSameHead", "Required CI gates pass on one exact commit"],
    ["reliability.productionRevision", "Production revision is matched to the verified commit"],
    ["reliability.syntheticHealth", "Synthetic production journeys pass"],
    ["reliability.migrations", "Migration state and schema drift are verified"],
    ["reliability.rollback", "Rollback or recovery has been exercised"],
  ] },
] as const satisfies readonly {
  id: string;
  title: string;
  checks: readonly (readonly [string, string])[];
}[];

export type JarvisCapabilityId = (typeof definitions)[number]["id"];
export type JarvisCapabilityCheckId = (typeof definitions)[number]["checks"][number][0];

export type JarvisCapabilityCheck = {
  id: JarvisCapabilityCheckId;
  label: string;
  status: JarvisCapabilityEvidenceStatus;
  summary: string;
  source: string | null;
  checkedAt: string | null;
};

export type JarvisCapabilityAreaScore = {
  id: JarvisCapabilityId;
  title: string;
  score: number;
  verified: number;
  total: number;
  status: "verified_10_of_10" | "gaps_found" | "evidence_incomplete";
  checks: JarvisCapabilityCheck[];
  blockers: string[];
};

export type JarvisCapabilityScorecard = {
  checkedAt: string;
  overallScore: number;
  verifiedChecks: number;
  totalChecks: number;
  verified10Of10Areas: number;
  areas: JarvisCapabilityAreaScore[];
  nextActions: string[];
  policy: string;
};

const statusValues = new Set<JarvisCapabilityEvidenceStatus>(["verified", "failed", "unknown", "configured", "not_run"]);

function validEvidence(value: unknown): value is JarvisCapabilityEvidence {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<JarvisCapabilityEvidence>;
  return typeof item.status === "string" &&
    statusValues.has(item.status as JarvisCapabilityEvidenceStatus) &&
    typeof item.summary === "string" &&
    item.summary.trim().length > 0 &&
    (item.source === undefined || typeof item.source === "string") &&
    (item.checkedAt === undefined || typeof item.checkedAt === "string");
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Returns a conservative score. Only literal status="verified" counts.
 * Configured, unknown, not_run, malformed, failed, and omitted evidence are blockers.
 */
export function scoreJarvisCapabilities(
  evidence: Partial<Record<JarvisCapabilityCheckId, JarvisCapabilityEvidence>>,
  checkedAt = new Date().toISOString(),
): JarvisCapabilityScorecard {
  const areas: JarvisCapabilityAreaScore[] = definitions.map((definition) => {
    const checks = definition.checks.map(([id, label]) => {
      const candidate = evidence?.[id as JarvisCapabilityCheckId];
      const item: JarvisCapabilityEvidence = validEvidence(candidate)
        ? candidate
        : { status: "unknown", summary: "No reliable evidence supplied." };
      return {
        id: id as JarvisCapabilityCheckId,
        label,
        status: item.status,
        summary: item.summary.slice(0, 500),
        source: typeof item.source === "string" ? item.source.slice(0, 240) : null,
        checkedAt: typeof item.checkedAt === "string" ? item.checkedAt.slice(0, 64) : null,
      };
    });
    const verified = checks.filter((check) => check.status === "verified").length;
    const score = roundScore((verified / checks.length) * 10);
    const blockers = checks
      .filter((check) => check.status !== "verified")
      .map((check) => check.label + ": " + check.summary);
    const hasFailure = checks.some((check) => check.status === "failed");
    return {
      id: definition.id,
      title: definition.title,
      score,
      verified,
      total: checks.length,
      status: score === 10
        ? "verified_10_of_10"
        : hasFailure ? "gaps_found" : "evidence_incomplete",
      checks,
      blockers,
    };
  });
  const totalChecks = areas.reduce((sum, area) => sum + area.total, 0);
  const verifiedChecks = areas.reduce((sum, area) => sum + area.verified, 0);
  const overallScore = roundScore(areas.reduce((sum, area) => sum + area.score, 0) / areas.length);
  const nextActions = areas
    .flatMap((area) => area.blockers.map((blocker) => ({ area: area.title, score: area.score, blocker })))
    .sort((a, b) => a.score - b.score || a.area.localeCompare(b.area))
    .slice(0, 8)
    .map((item) => item.area + ": " + item.blocker);
  return {
    checkedAt,
    overallScore,
    verifiedChecks,
    totalChecks,
    verified10Of10Areas: areas.filter((area) => area.status === "verified_10_of_10").length,
    areas,
    nextActions,
    policy: "Scores reflect supplied evidence, not aspirations. Only verified checks count; configured, unknown, failed, missing, or malformed evidence cannot produce a 10/10.",
  };
}

/**
 * Self-audit rows for the prospect demo engine (find -> enrich -> gate -> send
 * -> replies -> engagement -> runtime). Scored on the same rule as the seven
 * areas: only literal "verified" evidence from live tables counts.
 */
export const DEMO_ENGINE_ROWS = [
  ["acquisition", "Prospect acquisition", "Places searches and autopilot runs found real businesses"],
  ["enrichment", "Contact enrichment", "Published contact emails were found and verified"],
  ["gate", "Outreach quality gate", "The production gate checked demos before sending"],
  ["outreach", "Outreach delivery", "Preview links were delivered without failures dominating"],
  ["inbound", "Inbound replies", "Replies were received, classified and handled"],
  ["engagement", "Preview engagement", "Prospects' preview views are being recorded"],
  ["runtime", "Engine runtime", "The scheduled engine run is recent and healthy"],
] as const;

export type DemoEngineRowId = (typeof DEMO_ENGINE_ROWS)[number][0];

export type DemoEngineEvidence = JarvisCapabilityEvidence & {
  /** Small live numbers behind the verdict (counts, timestamps). */
  metrics?: Record<string, number | string | null>;
};

export type DemoEngineRow = {
  id: DemoEngineRowId;
  title: string;
  label: string;
  status: JarvisCapabilityEvidenceStatus;
  summary: string;
  source: string | null;
  checkedAt: string | null;
  metrics: Record<string, number | string | null>;
};

export type DemoEngineAudit = {
  checkedAt: string;
  score: number;
  verified: number;
  total: number;
  rows: DemoEngineRow[];
  policy: string;
};

function cleanMetrics(value: unknown): Record<string, number | string | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number | string | null> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 8)) {
    if (item === null || (typeof item === "number" && Number.isFinite(item))) out[key.slice(0, 40)] = item;
    else if (typeof item === "string") out[key.slice(0, 40)] = item.slice(0, 64);
  }
  return out;
}

export function scoreDemoEngine(
  evidence: Partial<Record<DemoEngineRowId, DemoEngineEvidence>>,
  checkedAt = new Date().toISOString(),
): DemoEngineAudit {
  const rows: DemoEngineRow[] = DEMO_ENGINE_ROWS.map(([id, title, label]) => {
    const candidate = evidence?.[id];
    const item: DemoEngineEvidence = validEvidence(candidate) ? candidate : { status: "unknown", summary: "No reliable evidence supplied." };
    return {
      id,
      title,
      label,
      status: item.status,
      summary: item.summary.slice(0, 240),
      source: typeof item.source === "string" ? item.source.slice(0, 120) : null,
      checkedAt: typeof item.checkedAt === "string" ? item.checkedAt.slice(0, 64) : null,
      metrics: validEvidence(candidate) ? cleanMetrics(item.metrics) : {},
    };
  });
  const verified = rows.filter((row) => row.status === "verified").length;
  return {
    checkedAt,
    score: roundScore((verified / rows.length) * 10),
    verified,
    total: rows.length,
    rows,
    policy: "Engine rows are read from live tables. Only verified rows count; configured, unknown or failed rows are gaps.",
  };
}
