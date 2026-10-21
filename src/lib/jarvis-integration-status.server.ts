/**
 * integrations.status: one answer to "what is connected and actually working".
 *
 * Each row separates four facts: a code path exists (installed), the key it
 * needs is saved (keyPresent), a durable record shows it ran (liveTested) and
 * the last error category. Configuration alone never counts as verified; a
 * section that cannot be read is null with a reason, and the whole report is
 * then needs_verification.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getJarvisDiagnosticToolCatalog } from "./jarvis-tool-registry";
import { jarvisToolReadiness, type JarvisReadinessId, type JarvisServiceId } from "./jarvis-tool-readiness";
import { latestJarvisToolRuns, type JarvisToolLastRun } from "./jarvis-tool-runs.server";
import { providerSnapshots } from "./integrations/registry.server";

/** Compact per-provider view of durable AI router usage (last 7 days). */
export type RouterHealthView = {
  providers: {
    provider: string;
    configured: boolean;
    ok7d: number | null;
    failed7d: number | null;
    dominantError: string | null;
    restingUntil: string | number | null;
  }[];
  paidLedger: unknown;
};

export type IntegrationStatusDeps = {
  /** Durable AI router health (shared usage rows). Absent until a router-health source is wired in. */
  routerHealth?: (db: SupabaseClient) => Promise<RouterHealthView>;
  env?: Record<string, string | undefined>;
};

type Unavailable = { section: string; reason: string };

const SERVICE_IDS: JarvisServiceId[] = ["stock.unsplash", "stock.pexels", "image.cloudflare", "image.huggingface", "image.pollinations"];

function failureCategory(reason: string | null) {
  if (!reason) return null;
  if (/timeout/i.test(reason)) return "timeout";
  if (/429|rate.?limit|quota/i.test(reason)) return "rate_limited";
  if (/malformed/i.test(reason)) return "malformed_response";
  if (/auth|401|403/i.test(reason)) return "authorization_failed";
  return "provider_error";
}

const short = (value: unknown, max = 60) => (typeof value === "string" ? value.slice(0, max) : null);
const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

export async function collectIntegrationStatus(db: SupabaseClient, deps: IntegrationStatusDeps = {}) {
  const unavailable: Unavailable[] = [];
  const readiness = jarvisToolReadiness(deps.env ?? process.env);

  let runs: Record<string, JarvisToolLastRun> | null = null;
  try {
    runs = await latestJarvisToolRuns(db, 300);
  } catch {
    unavailable.push({ section: "toolRuns", reason: "tool_run_records_unavailable" });
  }

  let tools: Record<string, unknown>[] | null = null;
  try {
    tools = getJarvisDiagnosticToolCatalog().map((tool) => {
      const ready = readiness[tool.id as JarvisReadinessId];
      const run = runs?.[tool.id] ?? null;
      return {
        id: tool.id,
        state: ready.state,
        ...(ready.secretName ? { secretName: ready.secretName } : {}),
        installed: true,
        keyPresent: ready.state === "key_present" ? true : ready.state === "needs_key" ? false : null,
        // Unknown (null) when the run records could not be read; never inferred from configuration.
        liveTested: run ? { at: run.at, status: run.status } : null,
        lastError: run && !run.ok ? run.reason ?? run.status : null,
      };
    });
  } catch {
    unavailable.push({ section: "tools", reason: "tool_catalog_unavailable" });
  }

  const services = SERVICE_IDS.map((id) => ({
    id,
    state: readiness[id].state,
    installed: readiness[id].state !== "not_implemented",
    keyPresent: readiness[id].state === "key_present" ? true : readiness[id].state === "needs_key" ? false : null,
    liveTested: null,
  }));

  let connectors: Record<string, unknown>[] | null = null;
  try {
    connectors = providerSnapshots().map((provider) => ({
      id: provider.id,
      implemented: provider.implemented,
      cost: provider.cost,
      keyPresent: provider.missing.length === 0,
      missingCredentialCount: provider.missing.length,
      // In-memory health resets on restart and differs per worker, so it is not durable proof.
      runtime: "process_local",
      liveTested: null,
      processLocalSuccessAt: provider.lastSuccessAt ? new Date(provider.lastSuccessAt).toISOString() : null,
      lastError: failureCategory(provider.lastFailureReason),
    }));
  } catch {
    unavailable.push({ section: "connectors", reason: "connector_registry_unavailable" });
  }

  let aiRouter: Record<string, unknown>[] | null = null;
  let paidLedger: unknown = null;
  if (!deps.routerHealth) {
    unavailable.push({ section: "aiRouter", reason: "router_health_source_not_installed" });
    unavailable.push({ section: "paidLedger", reason: "router_health_source_not_installed" });
  } else {
    try {
      const health = await deps.routerHealth(db);
      aiRouter = health.providers.map((row) => {
        const ok7d = count(row.ok7d);
        const failed7d = count(row.failed7d);
        return {
          id: short(row.provider, 40),
          configured: row.configured === true,
          keyPresent: row.configured === true,
          // Durable usage rows: a successful call in 7 days is live evidence; none is untested, not broken.
          liveTested: ok7d === null ? null : ok7d > 0,
          ok7d,
          failed7d,
          lastError: short(row.dominantError),
          restingUntil: typeof row.restingUntil === "number" ? new Date(row.restingUntil).toISOString() : short(row.restingUntil, 40),
        };
      });
      paidLedger = health.paidLedger ?? null;
      if (paidLedger === null) unavailable.push({ section: "paidLedger", reason: "paid_ledger_unavailable" });
    } catch {
      unavailable.push({ section: "aiRouter", reason: "router_health_unavailable" });
      unavailable.push({ section: "paidLedger", reason: "router_health_unavailable" });
    }
  }

  return {
    status: unavailable.length ? ("needs_verification" as const) : ("observed" as const),
    checkedAt: new Date().toISOString(),
    legend: "installed = code path exists; keyPresent = secret saved (null = no key needed); liveTested = durable record of a run (null = never recorded); configured alone is not verified.",
    tools,
    services,
    connectors,
    aiRouter,
    paidLedger,
    unavailable,
  };
}
