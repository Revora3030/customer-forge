import { describe, expect, it } from "vitest";
import {
  QaUrlError,
  claimQaJobs,
  enqueueQaJob,
  parseQaReport,
  recordQaReport,
  screenshotPath,
  validateQaUrl,
  type QaJob,
  type QaMetrics,
  type QaRepo,
  type QaScreenshot,
  type QaStorage,
} from "./qa-jobs.server";

const ORG = "11111111-1111-4111-8111-111111111111";
const JOB = "22222222-2222-4222-8222-222222222222";
const jpeg = Buffer.from("fake-jpeg-bytes").toString("base64");

/** In-memory copy of the rules in 20261101030000_qa_jobs.sql. */
function memoryRepo() {
  const jobs = new Map<string, QaJob>();
  const finished: { id: string; ok: boolean; screenshots: QaScreenshot[]; metrics: QaMetrics; error: string | null }[] = [];
  let n = 0;
  const repo: QaRepo = {
    async create(organizationId, url) {
      const active = [...jobs.values()].filter((j) => j.organization_id === organizationId && ["queued", "processing"].includes(j.status));
      if (active.length >= 3) throw new Error("too many active QA jobs for this workspace");
      const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
      const job: QaJob = { id, organization_id: organizationId, url, status: "queued", fence: 0, attempts: 0, max_attempts: 2 };
      jobs.set(id, job);
      return job;
    },
    async claim(_worker, max) {
      const out: QaJob[] = [];
      for (const job of jobs.values()) {
        if (out.length >= max || job.status !== "queued") continue;
        job.status = "processing";
        job.fence += 1;
        job.attempts += 1;
        out.push({ ...job });
      }
      return out;
    },
    async recoverStalled() {
      return 0;
    },
    async get(id) {
      const job = jobs.get(id);
      return job ? { ...job } : null;
    },
    async finish(id, fence, ok, screenshots, metrics, error) {
      const job = jobs.get(id);
      if (!job || job.fence !== fence || job.status !== "processing") return false;
      job.status = ok ? "done" : job.attempts < job.max_attempts ? "queued" : "failed";
      finished.push({ id, ok, screenshots, metrics, error });
      return true;
    },
  };
  return { repo, jobs, finished };
}

function memoryStorage() {
  const files = new Map<string, { bytes: number; type: string }>();
  const storage: QaStorage = {
    async upload(path, bytes, type) {
      files.set(path, { bytes: bytes.byteLength, type });
    },
  };
  return { storage, files };
}

const report = (over: Record<string, unknown> = {}) => ({
  jobId: JOB,
  fence: 1,
  ok: true,
  metrics: { phone: { httpStatus: 200, overflowX: false, consoleErrors: 0, loadMs: 900, title: "Acme Plumbing" } },
  screenshots: [
    { viewport: "phone", mime: "image/jpeg", base64: jpeg },
    { viewport: "desktop", mime: "image/jpeg", base64: jpeg },
  ],
  ...over,
});

describe("validateQaUrl", () => {
  it("accepts a public https page and drops the fragment", () => {
    expect(validateQaUrl("https://acme-plumbing.example.org/services#top")).toBe("https://acme-plumbing.example.org/services");
  });
  it.each([
    "http://acme.example.org/",
    "https://user:pw@acme.example.org/",
    "https://acme.example.org:8443/",
    "https://localhost/",
    "https://127.0.0.1/",
    "https://10.0.0.5/",
    "https://169.254.169.254/latest/meta-data",
    "javascript:alert(1)",
    "not a url",
  ])("refuses %s", (value) => {
    expect(() => validateQaUrl(value)).toThrow(QaUrlError);
  });
});

describe("enqueueQaJob and claimQaJobs", () => {
  it("queues a job, and a claim returns only id, url and fence", async () => {
    const { repo } = memoryRepo();
    await enqueueQaJob(repo, { organizationId: ORG, url: "https://acme.example.org/" });
    const claimed = await claimQaJobs(repo, "runner");
    expect(claimed).toHaveLength(1);
    expect(Object.keys(claimed[0]!).sort()).toEqual(["fence", "id", "url"]);
    expect(claimed[0]!.fence).toBe(1);
    expect(await claimQaJobs(repo, "runner")).toEqual([]);
  });
  it("refuses a private address before it is queued", async () => {
    const { repo, jobs } = memoryRepo();
    await expect(enqueueQaJob(repo, { organizationId: ORG, url: "https://192.168.1.1/" })).rejects.toBeInstanceOf(QaUrlError);
    expect(jobs.size).toBe(0);
  });
  it("limits a workspace to 3 active jobs", async () => {
    const { repo } = memoryRepo();
    for (let i = 0; i < 3; i += 1) await enqueueQaJob(repo, { organizationId: ORG, url: `https://acme.example.org/p${i}` });
    await expect(enqueueQaJob(repo, { organizationId: ORG, url: "https://acme.example.org/p4" })).rejects.toThrow(/too many/);
  });
  it("fails a claimed job whose stored address is no longer fetchable, instead of handing it out", async () => {
    const { repo, jobs, finished } = memoryRepo();
    jobs.set("bad", { id: "bad", organization_id: ORG, url: "https://127.0.0.1/", status: "queued", fence: 0, attempts: 0, max_attempts: 2 });
    expect(await claimQaJobs(repo, "runner")).toEqual([]);
    expect(finished[0]).toMatchObject({ id: "bad", ok: false, error: "That address can't be checked." });
  });
});

describe("parseQaReport", () => {
  it("accepts a complete successful report", () => {
    const parsed = parseQaReport(report());
    expect(typeof parsed).toBe("object");
    if (typeof parsed === "object") expect(parsed.metrics["phone"]?.loadMs).toBe(900);
  });
  it("needs both screenshots for a success", () => {
    expect(parseQaReport(report({ screenshots: [{ viewport: "phone", mime: "image/jpeg", base64: jpeg }] }))).toMatch(/both screenshots/);
  });
  it("needs a reason for a failure", () => {
    expect(parseQaReport(report({ ok: false, screenshots: [] }))).toMatch(/reason/);
    expect(typeof parseQaReport(report({ ok: false, screenshots: [], error: "Page did not load." }))).toBe("object");
  });
  it("rejects bad ids, unknown viewports, wrong types, bad base64 and oversize images", () => {
    expect(parseQaReport(report({ jobId: "x" }))).toMatch(/jobId/);
    expect(parseQaReport(report({ fence: 1.5 }))).toMatch(/fence/);
    expect(parseQaReport(report({ screenshots: [{ viewport: "tv", mime: "image/jpeg", base64: jpeg }] }))).toMatch(/viewport/);
    expect(parseQaReport(report({ screenshots: [{ viewport: "phone", mime: "text/html", base64: jpeg }] }))).toMatch(/JPEG or PNG/);
    expect(parseQaReport(report({ screenshots: [{ viewport: "phone", mime: "image/jpeg", base64: "not base64!" }] }))).toMatch(/base64/);
    expect(parseQaReport(report({ screenshots: [{ viewport: "phone", mime: "image/jpeg", base64: "A".repeat(2_100_000) }] }))).toMatch(/too large/);
    expect(parseQaReport(null)).toMatch(/object/);
  });
});

describe("recordQaReport", () => {
  async function claimed() {
    const mem = memoryRepo();
    const job = await enqueueQaJob(mem.repo, { organizationId: ORG, url: "https://acme.example.org/" });
    const [claim] = await claimQaJobs(mem.repo, "runner");
    return { ...mem, job, claim: claim! };
  }

  it("stores two screenshots under the workspace and job, then finishes the job", async () => {
    const { repo, job, claim, finished, jobs } = await claimed();
    const { storage, files } = memoryStorage();
    const parsed = parseQaReport(report({ jobId: job.id, fence: claim.fence }));
    if (typeof parsed === "string") throw new Error(parsed);
    expect(await recordQaReport(repo, storage, parsed)).toBe("recorded");
    expect([...files.keys()].sort()).toEqual([screenshotPath(ORG, job.id, "desktop"), screenshotPath(ORG, job.id, "phone")]);
    expect(jobs.get(job.id)!.status).toBe("done");
    expect(finished[0]!.screenshots).toHaveLength(2);
  });

  it("ignores a report from a superseded claim and stores nothing", async () => {
    const { repo, job, claim, jobs } = await claimed();
    jobs.get(job.id)!.fence += 1;
    const { storage, files } = memoryStorage();
    const parsed = parseQaReport(report({ jobId: job.id, fence: claim.fence }));
    if (typeof parsed === "string") throw new Error(parsed);
    expect(await recordQaReport(repo, storage, parsed)).toBe("stale");
    expect(files.size).toBe(0);
  });

  it("reports an unknown job", async () => {
    const { repo } = memoryRepo();
    const { storage } = memoryStorage();
    const parsed = parseQaReport(report());
    if (typeof parsed === "string") throw new Error(parsed);
    expect(await recordQaReport(repo, storage, parsed)).toBe("unknown_job");
  });

  it("a failed check stores no screenshots, keeps the reason and is retried once", async () => {
    const { repo, job, claim, jobs, finished } = await claimed();
    const { storage, files } = memoryStorage();
    const parsed = parseQaReport(report({ jobId: job.id, fence: claim.fence, ok: false, screenshots: [], error: "Page did not load." }));
    if (typeof parsed === "string") throw new Error(parsed);
    expect(await recordQaReport(repo, storage, parsed)).toBe("recorded");
    expect(files.size).toBe(0);
    expect(finished[0]!.error).toBe("Page did not load.");
    expect(jobs.get(job.id)!.status).toBe("queued");
  });
});
