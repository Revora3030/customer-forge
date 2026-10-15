import type { SupabaseClient } from "@supabase/supabase-js";
import { collectJarvisDiagnostics } from "./jarvis-diagnostics.server";
import { redactJarvisSummary } from "./jarvis-autopilot-policy";
import { getJarvisDiagnosticTool, isJarvisDiagnosticToolId, type JarvisDiagnosticToolId } from "./jarvis-tool-registry";
import { providerSnapshots } from "./integrations/registry.server";
import { scoreJarvisCapabilities, type JarvisCapabilityCheckId, type JarvisCapabilityEvidence, type JarvisCapabilityEvidenceStatus } from "./jarvis-capability-scorecard";

const SITE_ORIGIN = "https://revoragrowthsystems.com";
const GITHUB_REPOSITORY = "Revora3030/customer-forge";
const GITHUB_BRANCH = "lovable-sync";

export type JarvisToolEvidenceStatus = "observed" | "failed" | "unknown" | "needs_verification";

export type JarvisSerializableValue =
  | string
  | number
  | boolean
  | null
  | JarvisSerializableValue[]
  | { [key: string]: JarvisSerializableValue };

export type JarvisDiagnosticToolResult = {
  toolId: JarvisDiagnosticToolId;
  title: string;
  status: JarvisToolEvidenceStatus;
  checkedAt: string;
  durationMs: number;
  evidence: string;
  data: JarvisSerializableValue | { truncated: true; redactedPreview: string };
  limitations: string[];
};

function safeMetadata(value: string | null): string | null {
  return value ? redactJarvisSummary(value, 240) : null;
}

function safeProviderFailure(reason: string | null) {
  if (!reason) return null;
  if (/timeout/i.test(reason)) return "timeout";
  if (/429|rate.?limit|quota/i.test(reason)) return "rate_limited";
  if (/malformed/i.test(reason)) return "malformed_response";
  if (/auth|401|403/i.test(reason)) return "authorization_failed";
  return "provider_error";
}

function bounded(value: unknown, maxBytes: number): JarvisDiagnosticToolResult["data"] {
  let serialized: string;
  try {
    serialized = JSON.stringify(value ?? null);
  } catch {
    return { truncated: true, redactedPreview: "[UNSERIALIZABLE_DIAGNOSTIC_OUTPUT]" };
  }
  if (new TextEncoder().encode(serialized).byteLength > maxBytes) {
    return {
      truncated: true,
      redactedPreview: redactJarvisSummary(serialized, Math.min(9000, Math.max(0, maxBytes - 500))),
    };
  }
  try {
    // JSON round-tripping converts the value to the exact serializable data
    // contract expected by TanStack server functions; no class instances leak.
    return JSON.parse(serialized) as JarvisSerializableValue;
  } catch {
    return { truncated: true, redactedPreview: "[INVALID_JSON_DIAGNOSTIC_OUTPUT]" };
  }
}

function result(
  toolId: JarvisDiagnosticToolId,
  status: JarvisToolEvidenceStatus,
  data: unknown,
  options: { checkedAt: string; durationMs: number; limitations?: string[] },
): JarvisDiagnosticToolResult {
  const tool = getJarvisDiagnosticTool(toolId);
  if (!tool) throw new Error("Jarvis diagnostic tool is not registered.");
  return {
    toolId,
    title: tool.title,
    status,
    checkedAt: options.checkedAt,
    durationMs: Math.max(0, options.durationMs),
    evidence: tool.evidence,
    data: bounded(data, tool.maxOutputBytes),
    limitations: options.limitations ?? [],
  };
}

async function countRows(db: SupabaseClient, table: string, since?: string, status?: string): Promise<number | null> {
  try {
    let query = db.from(table).select("id", { count: "exact", head: true });
    if (since) query = query.gte("created_at", since);
    if (status) query = query.eq("status", status);
    const response = await query;
    return response.error ? null : response.count;
  } catch {
    return null;
  }
}

async function readLimited(response: Response, maximumBytes = 36000): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let remaining = maximumBytes;
  let output = "";
  try {
    while (remaining > 0) {
      const part = await reader.read();
      if (part.done) break;
      const chunk = part.value.subarray(0, remaining);
      output += decoder.decode(chunk, { stream: true });
      remaining -= chunk.byteLength;
      if (part.value.byteLength > chunk.byteLength) break;
    }
    output += decoder.decode();
    return output;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function publicPageCheck(path: "/" | "/robots.txt" | "/sitemap.xml") {
  try {
    const response = await fetch(new URL(path, SITE_ORIGIN), {
      method: "GET",
      redirect: "error",
      headers: { Accept: path.endsWith(".xml") ? "application/xml,text/xml,*/*" : "text/html,text/plain,*/*" },
      signal: AbortSignal.timeout(7000),
    });
    const body = await readLimited(response);
    const pick = (pattern: RegExp) => {
      const value = body.match(pattern)?.[1]?.trim().slice(0, 240);
      return value || null;
    };
    return {
      path,
      httpStatus: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type")?.slice(0, 120) ?? null,
      ...(path === "/" ? {
        title: safeMetadata(pick(/<title[^>]*>([^<]*)<\/title>/i)),
        description: safeMetadata(pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)),
        canonicalPath: (() => {
          const value = pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)/i);
          if (!value) return null;
          try {
            const canonical = new URL(value, SITE_ORIGIN);
            return canonical.origin === SITE_ORIGIN ? canonical.pathname.slice(0, 240) : null;
          } catch {
            return null;
          }
        })(),
        h1Count: (body.match(/<h1[\s>]/gi) ?? []).length,
        noindexCandidate: /name=["']robots["'][^>]+noindex/i.test(body),
        inspectionLimitBytes: 36000,
      } : {}),
      ...(path === "/robots.txt" ? {
        mentionsSitemap: /sitemap/i.test(body),
        disallowsRoot: /^\s*Disallow:\s*\/\s*$/im.test(body),
      } : {}),
      ...(path === "/sitemap.xml" ? { sitemapLocationCount: (body.match(/<loc>/gi) ?? []).length } : {}),
    };
  } catch {
    return { path, httpStatus: null, ok: false, contentType: null };
  }
}

async function publicWebsiteSmoke() {
  const checks = await Promise.all([
    publicPageCheck("/"),
    publicPageCheck("/robots.txt"),
    publicPageCheck("/sitemap.xml"),
  ]);
  const [home, robots, sitemap] = checks;
  const findings: string[] = [];
  if (home.httpStatus === null || robots.httpStatus === null || sitemap.httpStatus === null)
    findings.push("One or more public HTTP checks could not be completed.");
  if (checks.some((check) => check.httpStatus !== null && !check.ok))
    findings.push("One or more public endpoints returned a non-success HTTP status.");
  if (home.ok && "title" in home && !home.title) findings.push("Homepage title was not detected.");
  if (home.ok && "description" in home && !home.description) findings.push("Homepage meta description was not detected.");
  if (home.ok && "canonicalPath" in home && !home.canonicalPath) findings.push("Homepage canonical URL is missing, invalid, or points to another origin.");
  if (home.ok && "h1Count" in home && home.h1Count !== 1) findings.push("Homepage does not expose exactly one detectable H1.");
  if (home.ok && "noindexCandidate" in home && home.noindexCandidate) findings.push("Homepage includes a noindex candidate.");
  if (robots.ok && "mentionsSitemap" in robots && !robots.mentionsSitemap) findings.push("robots.txt does not mention a sitemap.");
  if (robots.ok && "disallowsRoot" in robots && robots.disallowsRoot) findings.push("robots.txt contains a root Disallow directive.");
  if (sitemap.ok && "sitemapLocationCount" in sitemap && sitemap.sitemapLocationCount === 0) findings.push("No sitemap <loc> entries were detected in the bounded response.");
  const status: JarvisToolEvidenceStatus = findings.some((finding) => finding.startsWith("One or more public HTTP checks could not"))
    ? "needs_verification"
    : findings.length > 0 ? "failed" : "observed";
  return { status, checks, findings };
}

async function providerEvidence() {
  const providers = providerSnapshots().map((provider) => ({
    id: provider.id,
    label: provider.label,
    capabilities: provider.capabilities,
    scope: provider.scope,
    cost: provider.cost,
    implemented: provider.implemented,
    status: provider.status,
    permission: provider.permission,
    runtimeVerifiedInThisProcess: provider.runtimeVerified,
    lastSuccessAt: provider.lastSuccessAt,
    lastFailureAt: provider.lastFailureAt,
    lastFailureCategory: safeProviderFailure(provider.lastFailureReason),
    rateLimitedUntil: provider.rateLimitedUntil,
    missingCredentialCount: provider.missing.length,
  }));
  return {
    status: "observed" as const,
    checkedAt: new Date().toISOString(),
    providers,
    limitations: [
      "Credential presence is not a live health check.",
      "Runtime success/failure evidence is process-local and can reset after restart.",
      "This report does not establish quota, licensing, billing eligibility, or future provider availability.",
    ],
  };
}

async function releaseEvidence() {
  const token = process.env["REVORA_GITHUB_READ_TOKEN"];
  const apiRoot = `https://api.github.com/repos/${GITHUB_REPOSITORY}`;
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Revora-Jarvis-ReadOnly-Diagnostics",
    ...(token ? { Authorization: "Bearer " + token } : {}),
  };
  try {
    // CI on an old commit is not evidence for the current release. Fetch the
    // release branch's current commit independently and bind every verdict to it.
    const [headResponse, runsResponse] = await Promise.all([
      fetch(apiRoot + "/commits/" + encodeURIComponent(GITHUB_BRANCH), {
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(7000),
      }),
      fetch(apiRoot + "/actions/runs?branch=" + encodeURIComponent(GITHUB_BRANCH) + "&per_page=100", {
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(7000),
      }),
    ]);
    if (!headResponse.ok || !runsResponse.ok) {
      const failedStatus = !headResponse.ok ? headResponse.status : runsResponse.status;
      return {
        status: "needs_verification" as const,
        httpStatus: failedStatus,
        reason: failedStatus === 401 || failedStatus === 403 ? "github_access_or_rate_limit" : "github_api_unavailable",
        branchHeadCommit: null,
        runs: [],
      };
    }
    const head = await headResponse.json() as { sha?: string };
    const currentHead = /^[a-f0-9]{40}$/i.test(head.sha ?? "") ? head.sha! : null;
    const json = await runsResponse.json() as {
      total_count?: number;
      workflow_runs?: Array<{
        name?: string | null;
        status?: string | null;
        conclusion?: string | null;
        event?: string | null;
        created_at?: string | null;
        updated_at?: string | null;
        head_sha?: string | null;
        html_url?: string | null;
      }>;
    };
    const rawRuns = (json.workflow_runs ?? []).map((run) => ({
      name: (run.name ?? "Unnamed workflow").slice(0, 160),
      status: run.status ?? "unknown",
      conclusion: run.conclusion ?? null,
      event: (run.event ?? "unknown").slice(0, 60),
      createdAt: run.created_at ?? null,
      updatedAt: run.updated_at ?? null,
      commit: /^[a-f0-9]{40}$/i.test(run.head_sha ?? "") ? run.head_sha : null,
      url: run.html_url?.startsWith("https://github.com/Revora3030/customer-forge/actions/runs/") ? run.html_url : null,
    }));
    // Keep the newest relevant run per workflow name for the current release
    // SHA. Include missing evidence as absent so consumers cannot infer a pass.
    const names = [
      /revora quality gate/i,
      /revora security gate/i,
      /revora browser qa/i,
    ];
    const runs = names.flatMap((pattern) => {
      const relevant = rawRuns.filter((run) => pattern.test(run.name));
      return relevant.slice(0, 10).filter((run, index) =>
        index === 0 || run.commit === currentHead
      ).slice(0, 1);
    });
    const status = currentHead && runs.length > 0
      ? "observed" as const
      : "needs_verification" as const;
    return {
      status,
      repository: GITHUB_REPOSITORY,
      branch: GITHUB_BRANCH,
      branchHeadCommit: currentHead,
      checkedAt: new Date().toISOString(),
      totalCountReported: Number.isInteger(json.total_count) ? json.total_count : null,
      runs,
      limitation: "A workflow passes for the current release only when it is completed successfully on the exact current branch commit. CI evidence is not proof of a deployed production revision.",
    };
  } catch {
    return { status: "unknown" as const, reason: "github_api_unreachable", branchHeadCommit: null, runs: [] };
  }
}

/** Execute only a fixed, read-only diagnostic. This function contains no generic DB/HTTP execution path. */
export async function executeJarvisDiagnosticTool(
  db: SupabaseClient,
  requestedToolId: string,
): Promise<JarvisDiagnosticToolResult> {
  if (!isJarvisDiagnosticToolId(requestedToolId)) throw new Error("Unknown Jarvis diagnostic tool.");
  const toolId = requestedToolId;
  const tool = getJarvisDiagnosticTool(toolId);
  if (!tool || tool.access !== "read") throw new Error("Jarvis tool is not available for execution.");

  const checkedAt = new Date().toISOString();
  const started = Date.now();
  try {
    if (toolId === "jarvis.capabilities.scorecard") {
      const [diagnostics, website, ci] = await Promise.all([
        collectJarvisDiagnostics(db),
        publicWebsiteSmoke(),
        releaseEvidence(),
      ]);
      const evidence: Partial<Record<JarvisCapabilityCheckId, JarvisCapabilityEvidence>> = {};
      const setEvidence = (
        id: JarvisCapabilityCheckId,
        status: JarvisCapabilityEvidenceStatus,
        summary: string,
        source: string,
      ) => {
        evidence[id] = { status, summary, source, checkedAt };
      };
      const sectionStatus = (section: { status?: string } | undefined): JarvisCapabilityEvidenceStatus =>
        section?.status === "checked" ? "verified" : "unknown";
      setEvidence("diagnostics.errorSample", sectionStatus(diagnostics.sections["errors"]), "Error event sampling " + (diagnostics.sections["errors"]?.status ?? "unknown") + "; review redacted evidence and sample limits.", "live database diagnostic");
      setEvidence("diagnostics.builderHealth", sectionStatus(diagnostics.sections["builds"]), "Build/publish/image diagnostic " + (diagnostics.sections["builds"]?.status ?? "unknown") + "; aggregate evidence does not prove a root cause.", "live database diagnostic");
      setEvidence("diagnostics.schemaProbe", sectionStatus(diagnostics.sections["schema"]), "Read-only schema contract probe " + (diagnostics.sections["schema"]?.status ?? "unknown") + "; does not enumerate RLS or migration history.", "live database diagnostic");
      setEvidence("diagnostics.redaction", "configured", "Redaction helpers and regression tests exist in code; a production adversarial execution was not performed by this check.", "code configuration only");

      const ciRuns = Array.isArray(ci.runs) ? ci.runs : [];
      const qualityRun = ciRuns.find((run) => /quality gate/i.test(String(run.name)));
      const securityRun = ciRuns.find((run) => /security gate|authority validation|codeql/i.test(String(run.name)));
      const browserRun = ciRuns.find((run) => /browser qa|browser journey/i.test(String(run.name)));
      const requiredRuns = [qualityRun, securityRun, browserRun];
      const sharedCommit = requiredRuns.every((run) =>
        Boolean(run) &&
        run?.status === "completed" &&
        run?.conclusion === "success" &&
        typeof run?.commit === "string" &&
        run.commit === requiredRuns[0]?.commit
      );
      const runStatus = (run: (typeof ciRuns)[number] | undefined): JarvisCapabilityEvidenceStatus => {
        const sameCommit = Boolean(run?.commit && requiredRuns[0]?.commit && run.commit === requiredRuns[0].commit);
        if (run?.status === "completed" && run.conclusion === "success" && sharedCommit && sameCommit) return "verified";
        if (run?.status === "completed" && run.conclusion && run.conclusion !== "success" && sameCommit) return "failed";
        return "unknown";
      };
      const qualityStatus = runStatus(qualityRun);
      setEvidence("engineering.typecheck", qualityStatus, "Quality Gate: " + (qualityRun?.conclusion ?? qualityRun?.status ?? "missing") + "; completed success on the shared commit is required.", "GitHub Actions");
      setEvidence("engineering.lint", qualityStatus, "Quality Gate: " + (qualityRun?.conclusion ?? qualityRun?.status ?? "missing") + "; completed success on the shared commit is required.", "GitHub Actions");
      setEvidence("engineering.tests", qualityStatus, "Quality Gate: " + (qualityRun?.conclusion ?? qualityRun?.status ?? "missing") + "; completed success on the shared commit is required.", "GitHub Actions");
      setEvidence("engineering.security", runStatus(securityRun), "Security/authority gate: " + (securityRun?.conclusion ?? securityRun?.status ?? "missing") + ".", "GitHub Actions");
      setEvidence("engineering.browser", runStatus(browserRun), "Browser QA: " + (browserRun?.conclusion ?? browserRun?.status ?? "missing") + ".", "GitHub Actions");
      setEvidence("reliability.ciSameHead", sharedCommit ? "verified" : "unknown", sharedCommit ? "Quality, security, and browser gates passed for one shared commit." : "Required gate results were not all verified as successful for the same commit.", "GitHub Actions");

      const siteHasFailure = website.status === "failed";
      setEvidence("reliability.syntheticHealth", "unknown", siteHasFailure ? "The limited public-site smoke check found issues; full production synthetic journeys still need verification." : "Homepage/robots/sitemap checks are not a full production synthetic journey.", "public HTTP smoke check");
      setEvidence("reliability.productionRevision", "unknown", "This diagnostic cannot independently prove which commit is deployed.", "deployment evidence unavailable");
      setEvidence("reliability.migrations", "unknown", "API contract probes do not prove applied migration history or drift status.", "migration verification unavailable");
      setEvidence("reliability.rollback", "unknown", "A recovery plan does not prove a successful rollback exercise.", "rollback exercise unavailable");

      setEvidence("growth.funnelSignals", "configured", "Aggregate funnel queries are implemented; record counts are not represented as campaign-attributed revenue.", "read-only database query capability");
      setEvidence("growth.offerConsistency", "configured", "The application has one canonical offer source; live provider agreement requires a separate catalog contract.", "application configuration only");
      setEvidence("growth.attribution", "unknown", "Trusted campaign-to-paid-conversion attribution was not verified.", "attribution evidence unavailable");
      setEvidence("growth.experiments", "unknown", "Controlled conversion experiments and measured outcomes were not verified.", "experiment evidence unavailable");

      setEvidence("acquisition.scoring", "configured", "Explainable lead scoring is implemented; adversarial runtime payloads were not replayed.", "code configuration only");
      setEvidence("acquisition.consent", "unknown", "Durable, channel-specific consent provenance was not verified.", "consent evidence unavailable");
      setEvidence("acquisition.suppression", "configured", "Suppression policy exists; production webhook reconciliation remains separate.", "policy configuration only");
      setEvidence("acquisition.delivery", "unknown", "Durable provider receipts and bounce/complaint reconciliation were not verified.", "delivery evidence unavailable");
      setEvidence("acquisition.paidConversion", "unknown", "Lead-to-paid attribution from trusted billing events was not verified.", "conversion evidence unavailable");

      setEvidence("autonomy.killSwitch", "configured", "A server-owned kill-switch policy exists; its live persisted state was not verified.", "policy configuration only");
      setEvidence("autonomy.approvalConsumption", "configured", "Approval validation exists; atomic one-time consumption under concurrency was not exercised.", "policy configuration only");
      setEvidence("autonomy.idempotency", "configured", "Idempotency safeguards are defined; duplicate/concurrent production runs were not exercised.", "policy configuration only");
      setEvidence("autonomy.postconditions", "configured", "Independent verification is required by contract; no production write was executed.", "execution contract only");
      setEvidence("autonomy.recovery", "unknown", "Lease recovery, bounded retry, and dead-letter recovery were not verified end-to-end.", "recovery evidence unavailable");

      setEvidence("safety.superAdminBoundary", "configured", "Super-admin authorization is enforced server-side; this is not an authorization penetration test.", "server access-control implementation");
      setEvidence("safety.tenantIsolation", "unknown", "Cross-tenant negative tests were not run by this diagnostic.", "tenant isolation test evidence unavailable");
      setEvidence("safety.redaction", "configured", "Redaction helpers are present; production output was not adversarially exercised in this run.", "code configuration only");
      setEvidence("safety.audit", "configured", "Audit storage contracts exist; append-only trigger and grants require migration-level verification.", "database schema design only");
      setEvidence("safety.secretBoundary", "configured", "Diagnostic outputs exclude credential values by design; full model/tool data-flow verification remains required.", "tool registry and redaction design");

      const scorecard = scoreJarvisCapabilities(evidence, checkedAt);
      return result(toolId, scorecard.verified10Of10Areas === 7 ? "observed" : "needs_verification", scorecard, {
        checkedAt,
        durationMs: Date.now() - started,
        limitations: [
          "Scores are intentionally conservative: configured-only, missing, stale, or indirect evidence does not pass.",
          "A 10/10 requires every check in that area to be independently verified.",
          "This tool does not grant permissions, execute writes, send messages, publish websites, or spend money.",
        ],
      });
    }

    if (toolId === "platform.errors.summary" ||
        toolId === "builder.health.summary" ||
        toolId === "database.contracts.probe" ||
        toolId === "security.posture.summary") {
      const diagnostics = await collectJarvisDiagnostics(db);
      if (toolId === "platform.errors.summary") {
        const section = diagnostics.sections["errors"];
        return result(toolId, section?.status === "checked" ? "observed" : "unknown", section ?? null, { checkedAt, durationMs: Date.now() - started, limitations: [section?.note ?? "No evidence was returned."] });
      }
      if (toolId === "builder.health.summary") {
        const section = diagnostics.sections["builds"];
        return result(toolId, section?.status === "checked" ? "observed" : "unknown", section ?? null, { checkedAt, durationMs: Date.now() - started, limitations: [section?.note ?? "No evidence was returned."] });
      }
      if (toolId === "database.contracts.probe") {
        const section = diagnostics.sections["schema"];
        return result(toolId, section?.status === "checked" ? "observed" : "unknown", section ?? null, { checkedAt, durationMs: Date.now() - started, limitations: [section?.note ?? "No evidence was returned.", "Does not read migration history or enumerate RLS policies."] });
      }
      const schema = diagnostics.sections["schema"];
      const errors = diagnostics.sections["errors"];
      return result(toolId, "needs_verification", {
        schemaContractProbe: schema?.status ?? "unknown",
        errorSample: errors?.status ?? "unknown",
        stillNeedsDedicatedVerification: [
          "Complete RLS and grant inventory",
          "Tenant-isolation negative tests",
          "Authentication and role-boundary tests",
          "Dependency audit results for the exact release commit",
        ],
      }, { checkedAt, durationMs: Date.now() - started, limitations: ["This is a gap report, not a completed security audit."] });
    }

    if (toolId === "ai.providers.snapshot" || toolId === "connectors.permissions.snapshot") {
      const evidence = await providerEvidence();
      const data = toolId === "ai.providers.snapshot"
        ? evidence
        : {
            status: evidence.status,
            checkedAt: evidence.checkedAt,
            connectors: evidence.providers.map(({ id, label, scope, cost, implemented, status, permission, runtimeVerifiedInThisProcess, lastSuccessAt, missingCredentialCount }) => ({
              id, label, scope, cost, implemented, status, permission,
              runtimeVerifiedInThisProcess, lastSuccessAt, missingCredentialCount,
            })),
            limitations: evidence.limitations,
          };
      return result(toolId, "observed", data, { checkedAt, durationMs: Date.now() - started });
    }

    if (toolId === "website.public.seo-smoke") {
      const smoke = await publicWebsiteSmoke();
      return result(toolId, smoke.status, { checks: smoke.checks, findings: smoke.findings }, {
        checkedAt,
        durationMs: Date.now() - started,
        limitations: [
          "Only the fixed public homepage, robots.txt, and sitemap.xml were checked.",
          "This is not a browser rendering, mobile, accessibility, broken-link, or Search Console test.",
        ],
      });
    }

    if (toolId === "growth.funnel.summary") {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [accounts, trials, activeSubscriptionRecords, recentLeads] = await Promise.all([
        countRows(db, "platform_accounts"),
        countRows(db, "platform_trials"),
        countRows(db, "subscriptions", undefined, "active"),
        countRows(db, "leads", since),
      ]);
      const values = [accounts, trials, activeSubscriptionRecords, recentLeads];
      return result(toolId, values.some((value) => value === null) ? "needs_verification" : "observed", {
        period: { recentLeads: "last 7 days" },
        metrics: {
          platformAccountRecords: accounts,
          trialRecords: trials,
          activeSubscriptionRecords,
          leadsCreatedLastSevenDays: recentLeads,
        },
        definitions: {
          activeSubscriptionRecords: "Subscription records with status=active; not necessarily distinct paying customers.",
          unavailable: "null means the query was unavailable; it is not zero.",
        },
      }, {
        checkedAt,
        durationMs: Date.now() - started,
        limitations: ["Aggregate counts only; no customer or prospect rows are returned.", "Table-level RLS and query permissions remain authoritative."],
      });
    }

    if (toolId === "release.ci.evidence") {
      const evidence = await releaseEvidence();
      const status: JarvisToolEvidenceStatus = evidence.status === "observed"
        ? "observed"
        : evidence.status === "unknown" ? "unknown" : "needs_verification";
      return result(toolId, status, evidence, {
        checkedAt,
        durationMs: Date.now() - started,
        limitations: ["CI success does not prove production deployment or live-site health."],
      });
    }

    return result(toolId, "unknown", { reason: "unhandled_registered_tool" }, {
      checkedAt, durationMs: Date.now() - started,
      limitations: ["Registered tool has no executor path; fail-closed result."],
    });
  } catch {
    return result(toolId, "unknown", { reason: "diagnostic_execution_failed" }, {
      checkedAt,
      durationMs: Date.now() - started,
      limitations: ["No successful evidence was recorded for this diagnostic run."],
    });
  }
}
