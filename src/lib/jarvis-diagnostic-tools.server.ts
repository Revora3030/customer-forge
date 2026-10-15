import type { SupabaseClient } from "@supabase/supabase-js";
import { collectJarvisDiagnostics } from "./jarvis-diagnostics.server";
import { redactJarvisSummary } from "./jarvis-autopilot-policy";
import { getJarvisDiagnosticTool, isJarvisDiagnosticToolId, type JarvisDiagnosticToolId } from "./jarvis-tool-registry";
import { providerSnapshots } from "./integrations/registry.server";

const SITE_ORIGIN = "https://revoragrowthsystems.com";
const GITHUB_REPOSITORY = "Revora3030/customer-forge";
const GITHUB_BRANCH = "lovable-sync";

export type JarvisToolEvidenceStatus = "observed" | "failed" | "unknown" | "needs_verification";

export type JarvisDiagnosticToolResult = {
  toolId: JarvisDiagnosticToolId;
  title: string;
  status: JarvisToolEvidenceStatus;
  checkedAt: string;
  durationMs: number;
  evidence: string;
  data: unknown;
  limitations: string[];
};

function safeProviderFailure(reason: string | null) {
  if (!reason) return null;
  if (/timeout/i.test(reason)) return "timeout";
  if (/429|rate.?limit|quota/i.test(reason)) return "rate_limited";
  if (/malformed/i.test(reason)) return "malformed_response";
  if (/auth|401|403/i.test(reason)) return "authorization_failed";
  return "provider_error";
}

function bounded<T>(value: T, maxBytes: number): T | { truncated: true; redactedPreview: string } {
  const serialized = JSON.stringify(value ?? null);
  if (new TextEncoder().encode(serialized).byteLength <= maxBytes) return value;
  return {
    truncated: true,
    redactedPreview: redactJarvisSummary(serialized, Math.min(9000, maxBytes - 500)),
  };
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
    const pick = (pattern: RegExp) => body.match(pattern)?.[1]?.trim().slice(0, 240) ?? null;
    return {
      path,
      httpStatus: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type")?.slice(0, 120) ?? null,
      ...(path === "/" ? {
        title: pick(/<title[^>]*>([^<]*)<\/title>/i),
        description: pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i),
        canonical: pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)/i),
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
  if (home.ok && "canonicalPath" in home && !home.canonicalPath) findings.push("Homepage canonical URL was not detected.");
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
  const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runs?branch=${encodeURIComponent(GITHUB_BRANCH)}&per_page=5`;
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Revora-Jarvis-ReadOnly-Diagnostics",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      redirect: "error",
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) {
      return {
        status: "needs_verification" as const,
        httpStatus: response.status,
        reason: response.status === 401 || response.status === 403 ? "github_access_or_rate_limit" : "github_api_unavailable",
        runs: [],
      };
    }
    const json = await response.json() as {
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
    const runs = (json.workflow_runs ?? []).slice(0, 5).map((run) => ({
      name: (run.name ?? "Unnamed workflow").slice(0, 160),
      status: run.status ?? "unknown",
      conclusion: run.conclusion ?? null,
      event: (run.event ?? "unknown").slice(0, 60),
      createdAt: run.created_at ?? null,
      updatedAt: run.updated_at ?? null,
      commit: /^[a-f0-9]{40}$/i.test(run.head_sha ?? "") ? run.head_sha : null,
      url: run.html_url?.startsWith("https://github.com/Revora3030/customer-forge/actions/runs/") ? run.html_url : null,
    }));
    return {
      status: runs.length ? "observed" as const : "needs_verification" as const,
      repository: GITHUB_REPOSITORY,
      branch: GITHUB_BRANCH,
      totalCountReported: Number.isInteger(json.total_count) ? json.total_count : null,
      runs,
      limitation: "CI evidence is not proof of a deployed production revision.",
    };
  } catch {
    return { status: "unknown" as const, reason: "github_api_unreachable", runs: [] };
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
