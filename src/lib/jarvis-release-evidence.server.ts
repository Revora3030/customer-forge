/**
 * Read-only CI evidence for the fixed repository's release branch head: the
 * GitHub Actions workflow runs and the check runs (every job, plus code
 * scanning such as CodeQL) on that exact commit. REVORA_GITHUB_READ_TOKEN is the
 * only credential used; without it the public, rate-limited API is read.
 *
 * Every verdict is bound to the branch's current commit. A run on an older
 * commit is kept for explanation only and never counts as a pass. Skipped,
 * cancelled, neutral and stale results are "not_run", never "failed" and never
 * "passed". A gate with no run on the head is "missing".
 */

export const RELEASE_GITHUB_REPOSITORY = "Revora3030/customer-forge";
export const RELEASE_GITHUB_BRANCH = "lovable-sync";

export type ReleaseVerdict = "passed" | "failed" | "not_run" | "pending";
export type ReleaseGateVerdict = ReleaseVerdict | "missing";
export type ReleaseCheckApp = "github-actions" | "github-code-scanning" | "other";

export const RELEASE_GATE_IDS = [
  "quality", "security", "browser", "codeql", "semgrep", "trivy", "zap", "ossar", "devskim", "codacy",
] as const;
export type ReleaseGateId = (typeof RELEASE_GATE_IDS)[number];

export type ReleaseCheckRun = {
  name: string;
  app: ReleaseCheckApp;
  status: string;
  conclusion: string | null;
  verdict: ReleaseVerdict;
};

export type ReleaseWorkflowRun = {
  name: string;
  status: string;
  conclusion: string | null;
  event: string;
  createdAt: string | null;
  updatedAt: string | null;
  commit: string | null;
  url: string | null;
  onHead: boolean;
  /** Head runs only; a historical run is never evidence for the current head. */
  verdict: ReleaseVerdict | "not_on_head";
};

export type ReleaseGate = {
  verdict: ReleaseGateVerdict;
  /** Names of the head workflow runs and check runs that produced the verdict. */
  sources: string[];
};

export type ReleaseEvidence = {
  status: "observed" | "needs_verification" | "unknown";
  reason?: string;
  httpStatus?: number;
  repository?: string;
  branch?: string;
  branchHeadCommit: string | null;
  checkedAt?: string;
  totalCountReported?: number | null;
  runs: ReleaseWorkflowRun[];
  checkRunsRead?: boolean;
  checkRunsReason?: string;
  checkRuns?: ReleaseCheckRun[];
  omittedCheckRuns?: number;
  gates?: Record<ReleaseGateId, ReleaseGate>;
  missingGates?: ReleaseGateId[];
  limitations?: string[];
};

const SHA = /^[a-f0-9]{40}$/i;

/** Workflow-name and check-run-name patterns for each gate. */
const GATES: Record<ReleaseGateId, { workflow?: RegExp; check: RegExp }> = {
  quality: { workflow: /revora quality gate/i, check: /^typecheck, lint, test, build$/i },
  security: { workflow: /revora security gate/i, check: /^repository security audit$|live stripe catalog/i },
  browser: { workflow: /revora browser qa/i, check: /rendered-site qa/i },
  codeql: { workflow: /^codeql/i, check: /^analyze|codeql/i },
  semgrep: { workflow: /semgrep/i, check: /semgrep|^static analysis \(report-first/i },
  trivy: { workflow: /trivy/i, check: /trivy|^dependency, secret and configuration scan$/i },
  zap: { workflow: /dast/i, check: /\bzap\b|dast/i },
  ossar: { workflow: /^ossar$/i, check: /ossar/i },
  devskim: { workflow: /^devskim$/i, check: /devskim/i },
  codacy: { workflow: /codacy/i, check: /codacy/i },
};

/** Maps a GitHub status/conclusion pair. Only a completed success passes. */
export function releaseVerdict(status: string | null | undefined, conclusion: string | null | undefined): ReleaseVerdict {
  if (status !== "completed") return "pending";
  switch (conclusion) {
    case "success":
      return "passed";
    case "failure":
    case "timed_out":
    case "action_required":
    case "startup_failure":
      return "failed";
    default:
      // skipped, cancelled, neutral, stale, or anything unrecognised: it did not
      // produce a pass, and it is not evidence of a failure either.
      return "not_run";
  }
}

function checkApp(slug: string | null | undefined): ReleaseCheckApp {
  return slug === "github-actions" || slug === "github-code-scanning" ? slug : "other";
}

function gateVerdict(verdicts: ReleaseVerdict[]): ReleaseGateVerdict {
  if (verdicts.length === 0) return "missing";
  if (verdicts.includes("failed")) return "failed";
  if (verdicts.includes("pending")) return "pending";
  // A job that ran and passed is real evidence even when a sibling job was
  // conditionally skipped; a gate where nothing passed did not run.
  if (verdicts.includes("passed")) return "passed";
  return "not_run";
}

const MAX_CHECK_RUN_BYTES = 3600;
/** Stays under the registry's 9000-byte release.ci.evidence output contract. */
const MAX_EVIDENCE_BYTES = 8600;

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function collectReleaseEvidence(): Promise<ReleaseEvidence> {
  const token = process.env["REVORA_GITHUB_READ_TOKEN"];
  const apiRoot = `https://api.github.com/repos/${RELEASE_GITHUB_REPOSITORY}`;
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Revora-Jarvis-ReadOnly-Diagnostics",
    ...(token ? { Authorization: "Bearer " + token } : {}),
  };
  const get = (path: string) => fetch(apiRoot + path, { headers, redirect: "manual", signal: AbortSignal.timeout(7000) });
  const accessReason = (status: number) => status === 401 || status === 403 ? "github_access_or_rate_limit" : "github_api_unavailable";
  try {
    // CI on an old commit is not evidence for the current release. Fetch the
    // release branch's current commit independently and bind every verdict to it.
    // Check runs are requested by branch ref in parallel to stay inside the
    // tool's time budget; each one is then kept only if its head_sha equals the
    // independently fetched head, so a branch move between calls cannot leak
    // an older commit's results in.
    const [headResponse, runsResponse, checksResponse] = await Promise.all([
      get("/commits/" + encodeURIComponent(RELEASE_GITHUB_BRANCH)),
      get("/actions/runs?branch=" + encodeURIComponent(RELEASE_GITHUB_BRANCH) + "&per_page=100"),
      // A check-run read failure only removes job-level evidence; it must not
      // hide the workflow-run evidence that was read successfully.
      get("/commits/" + encodeURIComponent(RELEASE_GITHUB_BRANCH) + "/check-runs?per_page=100").catch(() => null),
    ]);
    if (!headResponse.ok || !runsResponse.ok) {
      const failedStatus = !headResponse.ok ? headResponse.status : runsResponse.status;
      return { status: "needs_verification", httpStatus: failedStatus, reason: accessReason(failedStatus), branchHeadCommit: null, runs: [] };
    }
    const head = await readJson<{ sha?: string }>(headResponse);
    const currentHead = SHA.test(head?.sha ?? "") ? head!.sha! : null;
    const json = await readJson<{
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
    }>(runsResponse);
    const rawRuns = (json?.workflow_runs ?? []).map((run): ReleaseWorkflowRun => {
      const commit = SHA.test(run.head_sha ?? "") ? run.head_sha! : null;
      const onHead = Boolean(currentHead && commit === currentHead);
      return {
        name: (run.name ?? "Unnamed workflow").slice(0, 160),
        status: run.status ?? "unknown",
        conclusion: run.conclusion ?? null,
        event: (run.event ?? "unknown").slice(0, 60),
        createdAt: run.created_at ?? null,
        updatedAt: run.updated_at ?? null,
        commit,
        url: run.html_url?.startsWith(`https://github.com/${RELEASE_GITHUB_REPOSITORY}/actions/runs/`) ? run.html_url : null,
        onHead,
        verdict: onHead ? releaseVerdict(run.status, run.conclusion) : "not_on_head",
      };
    });

    // Check runs cover every job of every workflow, plus code-scanning results
    // (CodeQL, and Semgrep/Trivy SARIF uploads), for the exact head commit.
    let checkRunsRead = false;
    let checkRunsReason: string | undefined;
    let checkRunsHttpStatus: number | undefined;
    let checkRunsTruncated = false;
    let checkRuns: ReleaseCheckRun[] = [];
    if (!currentHead) {
      checkRunsReason = "branch_head_unknown";
    } else if (!checksResponse) {
      checkRunsReason = "github_api_unreachable";
    } else {
      if (checksResponse.ok) {
        const body = await readJson<{ total_count?: number; check_runs?: Array<{ name?: string | null; status?: string | null; conclusion?: string | null; head_sha?: string | null; app?: { slug?: string | null } | null }> }>(checksResponse);
        const sameHead = Array.isArray(body?.check_runs) ? body!.check_runs!.filter((run) => run.head_sha === currentHead) : [];
        if (!body || !Array.isArray(body.check_runs)) {
          checkRunsReason = "malformed_response";
        } else if (body.check_runs.length > 0 && sameHead.length === 0) {
          // The branch moved between the head read and the check-run read.
          checkRunsReason = "branch_moved_during_read";
        } else {
          checkRunsRead = true;
          checkRunsTruncated = Number.isInteger(body.total_count) && body.total_count! > body.check_runs.length;
          checkRuns = sameHead
            .map((run) => ({
              name: (run.name ?? "Unnamed check").slice(0, 80),
              app: checkApp(run.app?.slug),
              status: (run.status ?? "unknown").slice(0, 20),
              conclusion: run.conclusion ? run.conclusion.slice(0, 20) : null,
              verdict: releaseVerdict(run.status, run.conclusion),
            }));
        }
      } else {
        checkRunsHttpStatus = checksResponse.status;
        checkRunsReason = accessReason(checksResponse.status);
      }
    }

    const headRuns = rawRuns.filter((run) => run.onHead);
    const gates = Object.fromEntries(RELEASE_GATE_IDS.map((id) => {
      const pattern = GATES[id];
      const workflows = pattern.workflow ? headRuns.filter((run) => pattern.workflow!.test(run.name)) : [];
      const checks = checkRuns.filter((run) => pattern.check.test(run.name));
      const verdicts = [...workflows.map((run) => run.verdict as ReleaseVerdict), ...checks.map((run) => run.verdict)];
      const sources = [...workflows.map((run) => "workflow: " + run.name), ...checks.map((run) => "check: " + run.name)].slice(0, 3);
      return [id, { verdict: gateVerdict(verdicts), sources }];
    })) as Record<ReleaseGateId, ReleaseGate>;
    const missingGates = RELEASE_GATE_IDS.filter((id) => gates[id].verdict === "missing");

    // Keep the newest relevant run per primary workflow for the current head;
    // otherwise the newest historical run, labelled not_on_head.
    const runs = [GATES.quality.workflow!, GATES.security.workflow!, GATES.browser.workflow!].flatMap((pattern) => {
      const relevant = rawRuns.filter((run) => pattern.test(run.name));
      const current = relevant.find((run) => run.onHead);
      return current ? [current] : relevant.slice(0, 1);
    });

    // Keep the output inside the tool contract: compact checks, failures first.
    const order: Record<ReleaseVerdict, number> = { failed: 0, pending: 1, not_run: 2, passed: 3 };
    const sortedChecks = [...checkRuns].sort((a, b) => order[a.verdict] - order[b.verdict]);
    const keptChecks: ReleaseCheckRun[] = [];
    let used = 0;
    for (const check of sortedChecks) {
      const size = JSON.stringify(check).length + 1;
      if (used + size > MAX_CHECK_RUN_BYTES) break;
      keptChecks.push(check);
      used += size;
    }

    const accessLimited = !checkRunsRead && (checkRunsReason === "github_access_or_rate_limit");
    const status = currentHead && checkRunsRead && (runs.length > 0 || checkRuns.length > 0)
      ? "observed" as const
      : "needs_verification" as const;
    const evidence: ReleaseEvidence = {
      status,
      ...(accessLimited ? { reason: "github_access_or_rate_limit" } : {}),
      ...(checkRunsHttpStatus !== undefined ? { httpStatus: checkRunsHttpStatus } : {}),
      repository: RELEASE_GITHUB_REPOSITORY,
      branch: RELEASE_GITHUB_BRANCH,
      branchHeadCommit: currentHead,
      checkedAt: new Date().toISOString(),
      totalCountReported: Number.isInteger(json?.total_count) ? json!.total_count! : null,
      runs,
      checkRunsRead,
      ...(checkRunsReason ? { checkRunsReason } : {}),
      checkRuns: keptChecks,
      ...(checkRuns.length > keptChecks.length ? { omittedCheckRuns: checkRuns.length - keptChecks.length } : {}),
      gates,
      missingGates,
      limitations: [
        "A gate passes only when it completed successfully on the exact current branch commit; skipped, cancelled or neutral runs are not_run, and a gate with no run on the head is missing.",
        "CI evidence is not proof of a deployed production revision.",
        ...(checkRunsRead ? [] : ["Check runs could not be read, so job-level and code-scanning gates (CodeQL, Semgrep, Trivy, ZAP) are not evidenced."]),
        ...(checkRunsTruncated ? ["Only the first 100 check runs on the head were read; a gate shown as missing may exist beyond them."] : []),
      ],
    };
    const size = () => new TextEncoder().encode(JSON.stringify(evidence)).byteLength;
    while (size() > MAX_EVIDENCE_BYTES && evidence.checkRuns && evidence.checkRuns.length > 0) {
      evidence.checkRuns.pop();
      evidence.omittedCheckRuns = checkRuns.length - evidence.checkRuns.length;
    }
    return evidence;
  } catch {
    return { status: "unknown", reason: "github_api_unreachable", branchHeadCommit: null, runs: [] };
  }
}
