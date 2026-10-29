/**
 * Event sources for the Jarvis event watch. Each one reads existing records
 * (or GitHub's public CI status) and turns what it finds into platform events;
 * none writes anything, retries anything, or contacts anyone. Failures throw so
 * the bus can report the source as unreadable instead of as quiet.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventSource } from "@/lib/cognition/event-emitter";
import type { PlatformEvent } from "@/lib/cognition/event-rules";
import { retryScope } from "@/lib/cognition/build-plan";
import { GENERATION_STEPS, stepLabel } from "@/lib/site-engine";
import { PLATFORM_OWNER_ORG_ID } from "@/lib/platform-owner";
import { RESPONSE_KINDS, SPEED_GOAL_MINUTES, computeSpeedToLead, formatWait } from "@/lib/speed-to-lead";

type Db = Pick<SupabaseClient, "from">;
const DAY = 86_400_000;
const REPO = "Revora3030/customer-forge";
const RELEASE_BRANCH = "lovable-sync";

async function orgNames(db: Db, ids: readonly string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data } = await db.from("organizations").select("id, name").in("id", [...new Set(ids)]);
  return new Map((data ?? []).map((org) => [String(org.id), String(org.name ?? "a workspace")]));
}

export function buildFailedSource(db: Db): EventSource {
  return {
    name: "build.failed",
    async read(now) {
      const { data, error } = await db
        .from("generation_jobs")
        .select("id, organization_id, updated_at, failed_stage, failure_kind")
        .eq("status", "failed")
        .gte("updated_at", new Date(now - DAY).toISOString())
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(`generation_jobs: ${error.message}`);
      const names = await orgNames(db, (data ?? []).map((job) => String(job.organization_id)));
      const keys = GENERATION_STEPS.map((step) => step.key);
      return (data ?? []).map((job): PlatformEvent => {
        const scope = retryScope(keys, job.failed_stage as string | null);
        const where = scope ? `It stopped at "${stepLabel(scope.failed)}" (step ${scope.stepNumber} of ${scope.totalSteps}); a retry resumes from saved work where its inputs are unchanged.` : "";
        const kind = job.failure_kind ? ` Failure kind: ${String(job.failure_kind).slice(0, 60)}.` : "";
        return { id: String(job.id), type: "build.failed", occurredAt: Date.parse(String(job.updated_at)), subject: names.get(String(job.organization_id)) ?? "a workspace", detail: `${where}${kind}`.trim() };
      });
    },
  };
}

/** Scheduled routines that ended in an error (or were stopped before finishing) within the last day. */
export function routineFailedSource(db: Db): EventSource {
  return {
    name: "routine.failed",
    async read(now) {
      const { data, error } = await db
        .from("jarvis_routines")
        .select("id, name, last_summary, updated_at")
        .eq("enabled", true)
        .eq("last_status", "error")
        .gte("updated_at", new Date(now - DAY).toISOString())
        .limit(50);
      if (error) throw new Error(`jarvis_routines: ${error.message}`);
      return (data ?? []).map((routine): PlatformEvent => ({
        id: `${routine.id}|${routine.updated_at}`,
        type: "routine.failed",
        occurredAt: Date.parse(String(routine.updated_at)),
        subject: String(routine.name ?? "A routine").slice(0, 80),
        detail: String(routine.last_summary ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
      }));
    },
  };
}

type Run = { id?: number; name?: string | null; conclusion?: string | null; head_sha?: string | null; updated_at?: string | null; html_url?: string | null };

/** Completed CI runs that failed on the release branch's current commit, within the last day. */
export function ciFailedSource(fetcher: typeof fetch = fetch, token: string | null = process.env["REVORA_GITHUB_READ_TOKEN"]?.trim() || null): EventSource {
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "revora-jarvis-events", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const get = async <T>(path: string): Promise<T> => {
    const response = await fetcher(`https://api.github.com/repos/${REPO}/${path}`, { headers, redirect: "manual", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    return (await response.json()) as T;
  };
  return {
    name: "ci.failed",
    async read(now) {
      const [head, runs] = await Promise.all([
        get<{ sha?: string }>(`commits/${RELEASE_BRANCH}`),
        get<{ workflow_runs?: Run[] }>(`actions/runs?branch=${RELEASE_BRANCH}&status=completed&per_page=40`),
      ]);
      // CI on an old commit says nothing about the current release.
      const current = /^[0-9a-f]{40}$/i.test(head.sha ?? "") ? head.sha! : null;
      if (!current) throw new Error("no release commit");
      return (runs.workflow_runs ?? [])
        .filter((run) => run.conclusion === "failure" && run.head_sha === current && Date.parse(String(run.updated_at)) >= now - DAY)
        .map((run): PlatformEvent => ({
          id: String(run.id ?? `${run.name}-${run.updated_at}`),
          type: "ci.failed",
          occurredAt: Date.parse(String(run.updated_at)),
          subject: String(run.name ?? "Unnamed workflow").slice(0, 100),
          detail: `On commit ${current.slice(0, 7)}.${run.html_url?.startsWith(`https://github.com/${REPO}/actions/runs/`) ? ` ${run.html_url}` : ""}`,
        }));
    },
  };
}

/** Revora's own leads that have waited past the speed-to-lead goal with no logged call, email or text. */
export function leadUnansweredSource(db: Db): EventSource {
  return {
    name: "lead.unanswered",
    async read(now) {
      const since = new Date(now - DAY).toISOString();
      const [leads, activities] = await Promise.all([
        db.from("leads").select("id, name, created_at").eq("organization_id", PLATFORM_OWNER_ORG_ID).gte("created_at", since).limit(200),
        db.from("lead_activities").select("lead_id, kind, created_at").eq("organization_id", PLATFORM_OWNER_ORG_ID).in("kind", [...RESPONSE_KINDS]).gte("created_at", since).limit(1000),
      ]);
      if (leads.error) throw new Error(`leads: ${leads.error.message}`);
      if (activities.error) throw new Error(`lead_activities: ${activities.error.message}`);
      const names = new Map((leads.data ?? []).map((lead) => [String(lead.id), String(lead.name ?? "a visitor")]));
      const speed = computeSpeedToLead(
        (leads.data ?? []).map((lead) => ({ id: String(lead.id), created_at: String(lead.created_at) })),
        (activities.data ?? []).flatMap((a) => (a.lead_id ? [{ lead_id: String(a.lead_id), kind: String(a.kind), created_at: String(a.created_at) }] : [])),
        new Date(now),
        1,
      );
      return speed.waiting
        .filter((wait) => wait.minutes >= SPEED_GOAL_MINUTES)
        .map((wait): PlatformEvent => ({ id: wait.id, type: "lead.unanswered", occurredAt: now - wait.minutes * 60_000, subject: names.get(wait.id) ?? "a visitor", detail: `Waiting ${formatWait(wait.minutes)}.` }));
    },
  };
}

/** Free trials that end within a day and have not converted to a paid subscription. */
export function trialExpiringSource(db: Db): EventSource {
  return {
    name: "client.trial_expiring",
    async read(now) {
      const { data, error } = await db
        .from("platform_trials")
        .select("id, organization_id, trial_ends_at")
        .is("converted_at", null)
        .gt("trial_ends_at", new Date(now).toISOString())
        .lte("trial_ends_at", new Date(now + DAY).toISOString())
        .limit(100);
      if (error) throw new Error(`platform_trials: ${error.message}`);
      const rows = (data ?? []).filter((trial) => trial.organization_id !== PLATFORM_OWNER_ORG_ID);
      if (!rows.length) return [];
      const ids = rows.map((trial) => String(trial.organization_id));
      const [names, subs] = await Promise.all([orgNames(db, ids), db.from("subscriptions").select("organization_id").in("organization_id", ids).eq("status", "active")]);
      const paying = new Set((subs.data ?? []).map((sub) => String(sub.organization_id)));
      return rows
        .filter((trial) => !paying.has(String(trial.organization_id)))
        .map((trial): PlatformEvent => ({
          id: String(trial.id), type: "client.trial_expiring", occurredAt: now,
          subject: names.get(String(trial.organization_id)) ?? "a workspace",
          detail: `Trial ends ${new Date(String(trial.trial_ends_at)).toISOString().slice(0, 16).replace("T", " ")} UTC.`,
        }));
    },
  };
}
