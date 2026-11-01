import { z } from "zod";
import { LEVEL4_ACTION_KINDS, type Level4Action } from "@/lib/agent-authority";
import { buildStepStatuses } from "@/lib/builder/build-step-status";
import { GENERATION_STEPS } from "@/lib/site-engine";

/**
 * Agent gateway shapes, shared by the /api/public/agent/* routes and tests.
 * Browser-safe: no secrets, no database.
 *
 * Leads sent by an outside bot (Grok) go to the same owner review list as a
 * CSV import. Nothing here contacts anyone or starts a build.
 */

export const MAX_PROSPECTS_PER_CALL = 25;

const url = z.string().trim().url().max(300).refine((v) => /^https?:\/\//i.test(v), "must be http(s)");

export const agentProspectSchema = z
  .object({
    business_name: z.string().trim().min(1).max(160),
    city: z.string().trim().min(1).max(80),
    state: z.string().trim().max(40).optional(),
    trade: z.string().trim().min(1).max(80),
    contact_name: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(40).optional(),
    verified_email: z.string().trim().toLowerCase().email().max(200).optional(),
    source_url: url.optional(),
    website: url.optional(),
    /** 1–10, higher is a better fit. */
    score: z.number().int().min(1).max(10).optional(),
    why_selected: z.string().trim().max(500).optional(),
  })
  .strict()
  // A public email is only accepted with the page it was found on.
  .refine((lead) => !lead.verified_email || !!lead.source_url, {
    message: "verified_email needs the source_url of the page where it is shown",
    path: ["source_url"],
  });

export const agentProspectBatchSchema = z
  .object({ prospects: z.array(agentProspectSchema).min(1).max(MAX_PROSPECTS_PER_CALL) })
  .strict();

export type AgentProspect = z.infer<typeof agentProspectSchema>;

const csvCell = (value: string | number | undefined): string => {
  const text = value === undefined ? "" : String(value);
  // Neutralise spreadsheet formulas and quote every cell.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Turn gateway leads into the CSV the existing import reads, so both paths share every check. */
export function prospectsToCsv(prospects: readonly AgentProspect[]): string {
  const header = ["business name", "contact name", "city", "state", "category", "phone", "email", "website", "source", "score", "notes"];
  const rows = prospects.map((p) =>
    [p.business_name, p.contact_name, p.city, p.state, p.trade, p.phone, p.verified_email, p.website, p.source_url, p.score, p.why_selected].map(csvCell).join(","),
  );
  return [header.map(csvCell).join(","), ...rows].join("\n");
}

/** Constant-time comparison of the presented key with the configured one. */
export function agentKeyMatches(presented: string | null | undefined, expected: string | null | undefined): boolean {
  if (!presented || !expected || expected.length < 24) return false;
  const a = new TextEncoder().encode(presented);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/* ------------------------------ action requests ----------------------------- */


export const ACTION_REQUEST_TTL_HOURS = 48;
export const MAX_PENDING_ACTION_REQUESTS = 50;

const shortText = (max: number) => z.string().trim().min(1).max(max);
const httpsUrl = z.string().trim().url().max(500).refine((v) => /^https:\/\//i.test(v), "must be https");

/**
 * The evidence card every PR or bot operation carries (roadmap Phase 9).
 * Test numbers are what the bot observed; the founder sees them before approving.
 */
export const evidenceCardSchema = z
  .object({
    task_id: shortText(80),
    affected_files: z.array(z.string().trim().min(1).max(200)).max(200).default([]),
    observed_failure: z.string().trim().max(2000).optional(),
    fix_applied: z.string().trim().max(2000).optional(),
    tests: z
      .object({
        passed: z.number().int().min(0),
        failed: z.number().int().min(0),
        command: z.string().trim().max(200).optional(),
      })
      .strict()
      .optional(),
    typecheck: z.enum(["passed", "failed", "not_run"]).default("not_run"),
    build: z.enum(["passed", "failed", "not_run"]).default("not_run"),
    security: z.string().trim().max(1000).optional(),
    rollback: z.string().trim().max(1000).optional(),
    ci_url: httpsUrl.optional(),
  })
  .strict();

export type EvidenceCard = z.infer<typeof evidenceCardSchema>;

export const actionRequestSchema = z
  .object({
    kind: z.enum(LEVEL4_ACTION_KINDS as [Level4Action, ...Level4Action[]]),
    title: shortText(140),
    detail: z.string().trim().max(4000).optional(),
    /** A link the founder can open to see exactly what will happen (PR, preview, draft). */
    target_url: httpsUrl.optional(),
    /** Small structured details (PR number, site slug, batch size). Never secrets. */
    payload: z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).optional(),
    evidence: evidenceCardSchema.optional(),
    /** The bot's own id for this request, so a retry never makes a second one. */
    idempotency_key: z.string().trim().regex(/^[A-Za-z0-9._:-]{8,120}$/),
    requested_by: z.string().trim().regex(/^[a-z0-9-]{2,40}$/).default("grok"),
  })
  .strict()
  .refine((r) => !r.payload || JSON.stringify(r.payload).length <= 8000, { message: "payload is too large", path: ["payload"] })
  .refine((r) => r.kind !== "merge_pull_request" || !!r.evidence, {
    message: "a merge request needs an evidence card",
    path: ["evidence"],
  });

export type ActionRequestInput = z.infer<typeof actionRequestSchema>;

export const actionCompletionSchema = z
  .object({
    ok: z.boolean(),
    result_url: httpsUrl.optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

/** Payload keys that look like credentials are refused outright. */
export function payloadLooksSecret(payload: Record<string, unknown> | undefined): boolean {
  if (!payload) return false;
  return Object.entries(payload).some(
    ([key, value]) =>
      /(secret|token|password|api[_-]?key|service[_-]?role|authorization)/i.test(key) ||
      (typeof value === "string" && /(sk_live_|sk_test_|eyJhbGci|ghp_|github_pat_|xox[bp]-)/.test(value)),
  );
}

/* --------------------------------- builds --------------------------------- */

const BUILD_STATUSES = new Set(["queued", "processing", "completed", "failed", "cancelled", "parked", "waiting"]);

/** What a bot may see about one build: progress and stage, never customer content. */
export function publicBuildStatus(row: Record<string, unknown>) {
  const str = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : null);
  const status = str("status") ?? "unknown";
  const stages = row["stage_checkpoints"] && typeof row["stage_checkpoints"] === "object" ? Object.keys(row["stage_checkpoints"] as object) : [];
  const stepView = buildStepStatuses(
    GENERATION_STEPS.map((step) => step.key),
    { status, currentStep: str("current_step"), failedStage: str("failed_stage"), checkpointKeys: stages },
  );
  return {
    id: str("id"),
    organizationId: str("organization_id"),
    status: BUILD_STATUSES.has(status) ? status : status.slice(0, 40),
    progress: typeof row["progress"] === "number" ? Math.max(0, Math.min(100, row["progress"] as number)) : null,
    currentStep: str("current_step")?.slice(0, 120) ?? null,
    failedStage: str("failed_stage"),
    failureKind: str("failure_kind"),
    error: str("error_message")?.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]").slice(0, 300) ?? null,
    waitReason: str("wait_reason")?.slice(0, 200) ?? null,
    resumesAt: str("resumes_at"),
    attempts: typeof row["attempts"] === "number" ? row["attempts"] : null,
    capacityDeferrals: typeof row["capacity_deferrals"] === "number" ? row["capacity_deferrals"] : null,
    checkpoints: stages.slice(0, 40),
    buildSteps: stepView.steps,
    failedStep: stepView.failedStep,
    resumable: stepView.resumable,
    createdAt: str("created_at"),
    startedAt: str("started_at"),
    updatedAt: str("updated_at"),
    completedAt: str("completed_at"),
  };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ------------------------- action request records ------------------------- */

export type ActionRequestStatus = "pending" | "approved" | "rejected" | "completed" | "failed";
export type ActionRequestRow = {
  id: string;
  kind: Level4Action;
  title: string;
  detail: string | null;
  target_url: string | null;
  payload: Record<string, string | number | boolean | null>;
  evidence: EvidenceCard | null;
  requested_by: string;
  idempotency_key: string;
  status: ActionRequestStatus;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
  decision_note: string | null;
  completed_at: string | null;
  result_url: string | null;
  result_note: string | null;
};
export type ActionRequestView = ActionRequestRow & { state: ActionRequestStatus | "expired"; label: string };
