/**
 * Self-QA job queue (PAI-19).
 *
 * A job is one PUBLISHED public page that a GitHub Actions runner opens at phone
 * (390x844) and desktop (1440x900) size. The runner claims jobs and reports back
 * through `/api/public/jobs/qa-jobs`; screenshots land in the private
 * `qa-screenshots` bucket. Nothing here touches owner dashboards, and the runner
 * never uploads workflow artifacts (the repository is public).
 *
 * Other code starts a check with `enqueueQaJob` (the post-publish verification
 * and the PAI-20 repair loop call it). `supabaseQaRepo` talks to the SQL functions
 * in 20261101060500_qa_jobs.sql.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isFetchableHostname } from "@/lib/net-guard.server";

export const QA_VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;
export type QaViewportName = (typeof QA_VIEWPORTS)[number]["name"];

export const QA_BUCKET = "qa-screenshots";
/** Decoded size cap per screenshot (the bucket allows 2 MB). */
export const MAX_SCREENSHOT_BYTES = 1_500_000;
export const QA_LEASE_SECONDS = 600;
export const MAX_CLAIM = 3;

export type QaJob = {
  id: string;
  organization_id: string;
  url: string;
  status: "queued" | "processing" | "done" | "failed";
  fence: number;
  attempts: number;
  max_attempts: number;
};

export type QaMetrics = Record<string, { httpStatus: number | null; overflowX: boolean; consoleErrors: number; loadMs: number; title: string }>;

export type QaScreenshot = { viewport: QaViewportName; path: string; bytes: number };

export class QaUrlError extends Error {
  override name = "QaUrlError";
}

/** A public https page on a normal port, with no credentials. Returns the cleaned URL. */
export function validateQaUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(String(raw ?? "").trim());
  } catch {
    throw new QaUrlError("That is not a web address.");
  }
  if (url.protocol !== "https:") throw new QaUrlError("Only https pages can be checked.");
  if (url.username || url.password) throw new QaUrlError("The address must not contain a login.");
  if (url.port && url.port !== "443") throw new QaUrlError("Only the standard https port can be checked.");
  if (!isFetchableHostname(url.hostname)) throw new QaUrlError("That address can't be checked.");
  url.hash = "";
  return url.toString();
}

export function screenshotPath(organizationId: string, jobId: string, viewport: QaViewportName): string {
  return `${organizationId}/${jobId}/${viewport}.jpg`;
}

export type QaReport = {
  jobId: string;
  fence: number;
  ok: boolean;
  error: string | null;
  metrics: QaMetrics;
  screenshots: { viewport: QaViewportName; mime: "image/jpeg" | "image/png"; base64: string }[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Strict parse of what the runner posts back. Returns an error string or the report. */
export function parseQaReport(body: unknown): QaReport | string {
  if (!body || typeof body !== "object") return "Body must be a JSON object.";
  const b = body as Record<string, unknown>;
  if (typeof b["jobId"] !== "string" || !UUID.test(b["jobId"])) return "jobId is invalid.";
  if (!Number.isInteger(b["fence"])) return "fence is invalid.";
  if (typeof b["ok"] !== "boolean") return "ok must be true or false.";
  const names = new Set<string>(QA_VIEWPORTS.map((v) => v.name));
  const rawShots = Array.isArray(b["screenshots"]) ? (b["screenshots"] as unknown[]) : [];
  if (rawShots.length > QA_VIEWPORTS.length) return "Too many screenshots.";
  const screenshots: QaReport["screenshots"] = [];
  for (const item of rawShots) {
    const s = (item ?? {}) as Record<string, unknown>;
    if (typeof s["viewport"] !== "string" || !names.has(s["viewport"])) return "Unknown viewport.";
    if (s["mime"] !== "image/jpeg" && s["mime"] !== "image/png") return "Screenshot must be a JPEG or PNG.";
    if (typeof s["base64"] !== "string" || !BASE64.test(s["base64"])) return "Screenshot data is not base64.";
    if (Math.floor((s["base64"].length * 3) / 4) > MAX_SCREENSHOT_BYTES) return "Screenshot is too large.";
    if (screenshots.some((x) => x.viewport === s["viewport"])) return "Duplicate viewport.";
    screenshots.push({ viewport: s["viewport"] as QaViewportName, mime: s["mime"], base64: s["base64"] });
  }
  if (b["ok"] && screenshots.length !== QA_VIEWPORTS.length) return "A successful check needs both screenshots.";
  const metrics: QaMetrics = {};
  const rawMetrics = (b["metrics"] && typeof b["metrics"] === "object" ? b["metrics"] : {}) as Record<string, unknown>;
  for (const name of names) {
    const m = rawMetrics[name] as Record<string, unknown> | undefined;
    if (!m) continue;
    metrics[name] = {
      httpStatus: Number.isInteger(m["httpStatus"]) ? (m["httpStatus"] as number) : null,
      overflowX: m["overflowX"] === true,
      consoleErrors: Number.isInteger(m["consoleErrors"]) ? Math.max(0, m["consoleErrors"] as number) : 0,
      loadMs: Number.isFinite(m["loadMs"]) ? Math.max(0, Math.round(m["loadMs"] as number)) : 0,
      title: typeof m["title"] === "string" ? m["title"].slice(0, 200) : "",
    };
  }
  const error = typeof b["error"] === "string" && b["error"].trim() ? b["error"].trim().slice(0, 500) : null;
  if (!b["ok"] && !error) return "A failed check needs a reason.";
  return { jobId: b["jobId"], fence: b["fence"] as number, ok: b["ok"], error, metrics, screenshots };
}

export interface QaRepo {
  create(organizationId: string, url: string, runId?: string | null): Promise<QaJob>;
  claim(worker: string, max: number, leaseSeconds: number): Promise<QaJob[]>;
  recoverStalled(graceSeconds: number): Promise<number>;
  get(jobId: string): Promise<QaJob | null>;
  finish(jobId: string, fence: number, ok: boolean, screenshots: QaScreenshot[], metrics: QaMetrics, error: string | null): Promise<boolean>;
}

export interface QaStorage {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
}

/** Queue a check of one published page. Throws `QaUrlError` for an address that must not be fetched. */
export async function enqueueQaJob(repo: QaRepo, input: { organizationId: string; url: string; runId?: string | null }): Promise<QaJob> {
  if (!UUID.test(input.organizationId)) throw new Error("Invalid workspace");
  return repo.create(input.organizationId, validateQaUrl(input.url), input.runId ?? null);
}

/** Runner asks for work. Returns only what it needs to open the page. */
export async function claimQaJobs(repo: QaRepo, worker: string, max = MAX_CLAIM): Promise<{ id: string; url: string; fence: number }[]> {
  await repo.recoverStalled(60);
  const jobs = await repo.claim(worker, Math.min(MAX_CLAIM, Math.max(1, max)), QA_LEASE_SECONDS);
  const out: { id: string; url: string; fence: number }[] = [];
  for (const job of jobs) {
    try {
      // The address was checked when queued; check again in case rules changed.
      out.push({ id: job.id, url: validateQaUrl(job.url), fence: job.fence });
    } catch {
      await repo.finish(job.id, job.fence, false, [], {}, "That address can't be checked.");
    }
  }
  return out;
}

export type ReportOutcome = "recorded" | "stale" | "unknown_job";

/** Runner posts results. Screenshots are only stored for the claim that still holds the job. */
export async function recordQaReport(repo: QaRepo, storage: QaStorage, report: QaReport): Promise<ReportOutcome> {
  const job = await repo.get(report.jobId);
  if (!job) return "unknown_job";
  if (job.status !== "processing" || job.fence !== report.fence) return "stale";
  const stored: QaScreenshot[] = [];
  if (report.ok) {
    for (const shot of report.screenshots) {
      const bytes = Uint8Array.from(Buffer.from(shot.base64, "base64"));
      const path = screenshotPath(job.organization_id, job.id, shot.viewport).replace(/\.jpg$/, shot.mime === "image/png" ? ".png" : ".jpg");
      await storage.upload(path, bytes, shot.mime);
      stored.push({ viewport: shot.viewport, path, bytes: bytes.byteLength });
    }
  }
  const ok = await repo.finish(job.id, job.fence, report.ok, stored, report.metrics, report.error);
  return ok ? "recorded" : "stale";
}

type RpcResult = { data: unknown; error: { message: string } | null };
type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
  from: (table: string) => {
    select: (columns: string) => { eq: (column: string, value: string) => { maybeSingle: () => PromiseLike<RpcResult> } };
  };
  storage: { from: (bucket: string) => { upload: (path: string, body: Uint8Array, options: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> } };
};

async function call(client: RpcClient, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.message}`);
  return data;
}

const asJob = (row: unknown): QaJob | null => (row && typeof row === "object" ? (row as QaJob) : null);
const asJobs = (data: unknown): QaJob[] => (Array.isArray(data) ? (data.map(asJob).filter(Boolean) as QaJob[]) : []);

export function supabaseQaRepo(admin: SupabaseClient | unknown): QaRepo {
  const client = admin as RpcClient;
  return {
    async create(organizationId, url, runId) {
      const data = await call(client, "qa_job_create", { _org: organizationId, _url: url, _run: runId ?? null });
      const job = asJob(Array.isArray(data) ? data[0] : data);
      if (!job) throw new Error("qa_job_create returned no job");
      return job;
    },
    async claim(worker, max, leaseSeconds) {
      return asJobs(await call(client, "qa_job_claim", { _worker: worker, _max: max, _lease_seconds: leaseSeconds }));
    },
    async recoverStalled(graceSeconds) {
      const n = await call(client, "qa_job_recover_stalled", { _grace_seconds: graceSeconds });
      return typeof n === "number" ? n : 0;
    },
    async get(jobId) {
      const { data, error } = await client
        .from("qa_jobs")
        .select("id, organization_id, url, status, fence, attempts, max_attempts")
        .eq("id", jobId)
        .maybeSingle();
      if (error) throw new Error(`qa_jobs read failed: ${error.message}`);
      return asJob(data);
    },
    async finish(jobId, fence, ok, screenshots, metrics, error) {
      return (
        (await call(client, "qa_job_finish", {
          _job: jobId, _fence: fence, _ok: ok, _screenshots: screenshots, _metrics: metrics, _error: error,
        })) === true
      );
    },
  };
}

export function supabaseQaStorage(admin: SupabaseClient | unknown): QaStorage {
  const client = admin as RpcClient;
  return {
    async upload(path, bytes, contentType) {
      const { error } = await client.storage.from(QA_BUCKET).upload(path, bytes, { contentType, upsert: true });
      if (error) throw new Error(`screenshot upload failed: ${error.message}`);
    },
  };
}
