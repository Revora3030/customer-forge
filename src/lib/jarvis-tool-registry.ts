/**
 * The only diagnostic tools Jarvis may invoke directly.
 *
 * This registry intentionally contains read-only tools only. Mutations must be
 * introduced through a separately reviewed approval/execution contract and may
 * never be added here as a shortcut.
 */
export type JarvisDiagnosticTool = {
  id: string;
  title: string;
  category: "platform" | "builder" | "website" | "ai" | "database" | "security" | "growth" | "release";
  description: string;
  evidence: string;
  implementation: "implemented" | "partial";
  access: "read";
  risk: "low";
  requiresApproval: false;
  timeoutMs: number;
  maxOutputBytes: number;
};

export const JARVIS_DIAGNOSTIC_TOOLS = [
  {
    id: "platform.errors.summary",
    title: "Platform error summary",
    category: "platform",
    description: "Summarize the bounded seven-day error-event sample, grouped by sanitized fingerprints.",
    evidence: "Sanitized database query sample; may be truncated.",
    implementation: "implemented",
    access: "read",
    risk: "low",
    requiresApproval: false,
    timeoutMs: 10000,
    maxOutputBytes: 12000,
  },
  {
    id: "builder.health.summary",
    title: "Builder and publishing health",
    category: "builder",
    description: "Summarize bounded generation-job, publish-event, and image-record diagnostics.",
    evidence: "Sanitized database aggregates; not proof of the cause of a specific failure.",
    implementation: "implemented",
    access: "read",
    risk: "low",
    requiresApproval: false,
    timeoutMs: 12000,
    maxOutputBytes: 12000,
  },
  {
    id: "database.contracts.probe",
    title: "Database contract probes",
    category: "database",
    description: "Check whether a small set of expected column-select contracts are accepted.",
    evidence: "Read-only API contract probes; not migration history or an RLS audit.",
    implementation: "implemented",
    access: "read",
    risk: "low",
    requiresApproval: false,
    timeoutMs: 10000,
    maxOutputBytes: 8000,
  },
  {
    id: "website.public.seo-smoke",
    title: "Public website and SEO smoke test",
    category: "website",
    description: "Check the public homepage, robots.txt, and sitemap.xml using bounded, read-only HTTP requests.",
    evidence: "HTTP/HTML smoke test only; does not verify mobile layout, accessibility, Search Console indexing, or all pages.",
    implementation: "implemented",
    access: "read",
    risk: "low",
    requiresApproval: false,
    timeoutMs: 10000,
    maxOutputBytes: 8000,
  },
  {
    id: "ai.providers.snapshot",
    title: "AI provider and routing snapshot",
    category: "ai",
    description: "Show configured provider capability, coarse health evidence, cost class, and server-declared scope.",
    evidence: "Configuration and process-local runtime evidence; not a guarantee of quota, licensing, or future availability.",
    implementation: "implemented",
    access: "read",
    risk: "low",
    requiresApproval: false,
    timeoutMs: 5000,
    maxOutputBytes: 10000,
  },
  {
    id: "connectors.permissions.snapshot",
    title: "Connector permissions snapshot",
    category: "platform",
    description: "Summarize which connectors are implemented and the permission scope declared in code, without credential names or values.",
    evidence: "Capability-registry snapshot; does not grant connector access or prove a live health check.",
    implementation: "implemented",
    access: "read",
    risk: "low",
    requiresApproval: false,
    timeoutMs: 5000,
    maxOutputBytes: 10000,
  },
  {
    id: "growth.funnel.summary",
    title: "Privacy-preserving funnel summary",
    category: "growth",
    description: "Return the admin Analytics funnel (unique visitors, sessions, page views, accounts, trials, active trials, paid customers and conversion rates) for 7 and 30 days, plus lead counts; aggregate only, never prospect or customer rows.",
    evidence: "Counts are available only where the database query succeeds; an unavailable count is unknown, not zero.",
    implementation: "implemented",
    access: "read",
    risk: "low",
    requiresApproval: false,
    timeoutMs: 15000,
    maxOutputBytes: 8000,
  },
  {
    id: "release.ci.evidence",
    title: "Latest repository CI evidence",
    category: "release",
    description: "Read the latest public GitHub Actions run summaries for the fixed repository and lovable-sync branch.",
    evidence: "GitHub API response only; it does not prove which revision is deployed to production.",
    implementation: "implemented",
    access: "read",
    risk: "low",
    requiresApproval: false,
    timeoutMs: 8000,
    maxOutputBytes: 6000,
  },
  {
    id: "jarvis.capabilities.scorecard",
    title: "Seven-area capability verification scorecard",
    category: "security",
    description: "Score Jarvis diagnostics, engineering, growth, acquisition, autonomy, safety, and reliability using verified runtime/CI evidence. Unknown and configured-only checks do not pass.",
    evidence: "Conservative evidence-backed scorecard. It reports gaps and does not grant permissions or enable writes.",
    implementation: "implemented",
    access: "read",
    risk: "low",
    requiresApproval: false,
    timeoutMs: 15000,
    maxOutputBytes: 12000,
  },
  {
    id: "observability.export.status",
    title: "AI observability export status",
    category: "ai",
    description: "Report whether OTLP and Langfuse trace export are configured without revealing endpoints, keys, prompts, completions or tenant/user IDs.",
    evidence: "Configuration only; live ingestion remains unverified until a test span is observed at the destination.",
    implementation: "implemented",
    access: "read",
    risk: "low",
    requiresApproval: false,
    timeoutMs: 3000,
    maxOutputBytes: 4000,
  },
  {
    id: "security.posture.summary",
    title: "Security evidence and gaps",
    category: "security",
    description: "Report which security-adjacent evidence was checked and which important areas still need a dedicated audit.",
    evidence: "Partial evidence only. No claim of complete RLS, dependency, auth, or tenant-isolation coverage.",
    implementation: "partial",
    access: "read",
    risk: "low",
    requiresApproval: false,
    timeoutMs: 10000,
    maxOutputBytes: 5000,
  },
] as const satisfies readonly JarvisDiagnosticTool[];

export type JarvisDiagnosticToolId = (typeof JARVIS_DIAGNOSTIC_TOOLS)[number]["id"];

export function isJarvisDiagnosticToolId(value: unknown): value is JarvisDiagnosticToolId {
  return typeof value === "string" &&
    JARVIS_DIAGNOSTIC_TOOLS.some((tool) => tool.id === value);
}

export function getJarvisDiagnosticTool(toolId: string): JarvisDiagnosticTool | null {
  return JARVIS_DIAGNOSTIC_TOOLS.find((tool) => tool.id === toolId) ?? null;
}

export function getJarvisDiagnosticToolCatalog() {
  return JARVIS_DIAGNOSTIC_TOOLS.map((tool) => ({ ...tool }));
}
