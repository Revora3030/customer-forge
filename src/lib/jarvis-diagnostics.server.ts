import type { SupabaseClient } from "@supabase/supabase-js";

export type DiagnosticSection = {
  status: "checked" | "unavailable";
  note: string;
  data: unknown;
};
export type JarvisDiagnostics = {
  checkedAt: string;
  sections: Record<string, DiagnosticSection>;
};

export function redactDiagnosticText(value: unknown, limit = 240): string {
  return String(value ?? "")
    .replace(/https?:\/\/[^\s"'<>]+/gi, (value) => {
      try { const url = new URL(value); return `${url.origin}${url.pathname}`; }
      catch { return "[REDACTED URL]"; }
    })
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sb_secret_|sk_live_|sk_test_|whsec_|sk-proj-|lov_)[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED JWT]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED EMAIL]")
    .slice(0, limit);
}

const CONTRACTS = {
  builder_messages: ["request_id", "kind", "branch", "plan", "restore_version_id"],
  generation_jobs: ["cancel_requested_at", "cancelled_by", "failed_stage", "failure_kind", "stage_timings"],
  lead_delivery_logs: ["idempotency_key", "webhook_url", "status_code", "response_body"],
} as const;

async function checked(work: () => Promise<unknown>, note: string): Promise<DiagnosticSection> {
  try { return { status: "checked", note, data: await work() }; }
  catch { return { status: "unavailable", note: "Check failed; no healthy verdict can be inferred.", data: null }; }
}

export async function collectJarvisDiagnostics(db: SupabaseClient): Promise<JarvisDiagnostics> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const entries = await Promise.all([
    checked(async () => {
      const { data, error } = await db.from("error_events")
        .select("fingerprint,level,source,message,route,created_at,forwarded")
        .gte("created_at", since).order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      const groups = new Map<string, { fingerprint: string; source: string; message: string; route: string; count: number }>();
      for (const row of data ?? []) {
        const key = String(row.fingerprint);
        const existing = groups.get(key);
        if (existing) { existing.count += 1; continue; }
        groups.set(key, {
          fingerprint: redactDiagnosticText(row.fingerprint, 100),
          source: redactDiagnosticText(row.source, 40),
          message: redactDiagnosticText(row.message),
          route: redactDiagnosticText(String(row.route ?? "").split(/[?#]/)[0], 120),
          count: 1,
        });
      }
      return {
        sampledRows: data?.length ?? 0,
        possiblyTruncated: (data?.length ?? 0) >= 1000,
        groups: [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 15),
        sentryForwardingConfigured: Boolean(process.env["SENTRY_DSN"]),
        sentryIngestionVerified: false,
      };
    }, "Seven-day error sample; newest 1,000 rows maximum. Counts are sample counts."),
    checked(async () => {
      const [jobs, publishes, images] = await Promise.all([
        db.from("generation_jobs").select("status,failure_kind,failed_stage,stage_timings,created_at,started_at,completed_at")
          .gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
        db.from("publish_events").select("smoke_status").gte("created_at", since).limit(5000),
        db.from("image_records").select("status,source").gte("updated_at", since).limit(10000),
      ]);
      if (jobs.error || publishes.error || images.error) throw new Error("Build health unavailable");
      const { summariseBuilds, summarisePublishes, summariseImages, buildAlerts } = await import("./build-monitoring");
      const raw = summariseBuilds((jobs.data ?? []) as never);
      const builds = {
        ...raw,
        failuresByStage: raw.failuresByStage.slice(0, 15).map((row) => ({ ...row, stage: redactDiagnosticText(row.stage, 100) })),
        slowestStages: raw.slowestStages.map((row) => ({ ...row, stage: redactDiagnosticText(row.stage, 100) })),
      };
      const publish = summarisePublishes((publishes.data ?? []) as never);
      return {
        builds, publishes: publish, images: summariseImages((images.data ?? []) as never),
        alerts: buildAlerts(builds, publish),
        limits: { jobs: 5000, publishes: 5000, images: 10000 },
        possiblyTruncated: (jobs.data?.length ?? 0) >= 5000 || (publishes.data?.length ?? 0) >= 5000 || (images.data?.length ?? 0) >= 10000,
      };
    }, "Seven-day bounded aggregate; not a verified cause of an individual stalled build."),
    checked(async () => {
      const contracts = [];
      for (const [table, columns] of Object.entries(CONTRACTS)) {
        const { error } = await db.from(table).select(columns.join(",")).limit(0);
        contracts.push({ table, columns, status: error ? "unavailable" : "query_contract_accepted", code: error?.code ?? null });
      }
      return { contracts, limitation: "API contract probes only; failures can reflect permissions, schema cache, project identity or migrations. Do not generate additive DDL from this alone." };
    }, "Read-only API contract probes; not a migration-history or RLS audit."),
  ]);
  return { checkedAt: new Date().toISOString(), sections: { errors: entries[0]!, builds: entries[1]!, schema: entries[2]! } };
}
