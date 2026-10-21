import { afterEach, describe, expect, it, vi } from "vitest";
import { collectReleaseEvidence, releaseVerdict } from "./jarvis-release-evidence.server";

const HEAD = "a".repeat(40);
const OLD = "b".repeat(40);

type Run = { name: string; status?: string; conclusion?: string | null; head_sha?: string };
type Check = { name: string; status?: string; conclusion?: string | null; head_sha?: string; app?: string };

function stubGithub(options: { runs?: Run[]; checks?: Check[]; status?: number; checksStatus?: number; head?: string }) {
  const requested: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    requested.push(url.pathname + url.search);
    expect(url.hostname).toBe("api.github.com");
    expect(init?.redirect).toBe("manual");
    if (options.status) return new Response("{}", { status: options.status });
    if (url.pathname.endsWith("/check-runs")) {
      if (options.checksStatus) return new Response("{}", { status: options.checksStatus });
      const checks = options.checks ?? [];
      return Response.json({
        total_count: checks.length,
        check_runs: checks.map((check) => ({
          name: check.name,
          status: check.status ?? "completed",
          conclusion: check.conclusion === undefined ? "success" : check.conclusion,
          head_sha: check.head_sha ?? HEAD,
          app: { slug: check.app ?? "github-actions" },
        })),
      });
    }
    if (url.pathname.endsWith("/commits/lovable-sync")) return Response.json({ sha: options.head ?? HEAD });
    if (url.pathname.endsWith("/actions/runs")) {
      const runs = options.runs ?? [];
      return Response.json({
        total_count: runs.length,
        workflow_runs: runs.map((run) => ({
          name: run.name,
          status: run.status ?? "completed",
          conclusion: run.conclusion === undefined ? "success" : run.conclusion,
          head_sha: run.head_sha ?? HEAD,
          event: "push",
          html_url: "https://github.com/Revora3030/customer-forge/actions/runs/1",
        })),
      });
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, requested };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("release CI evidence", () => {
  it("maps GitHub conclusions without calling skipped or cancelled runs failed", () => {
    expect(releaseVerdict("completed", "success")).toBe("passed");
    for (const conclusion of ["failure", "timed_out", "action_required", "startup_failure"]) {
      expect(releaseVerdict("completed", conclusion)).toBe("failed");
    }
    for (const conclusion of ["skipped", "cancelled", "neutral", "stale"]) {
      expect(releaseVerdict("completed", conclusion)).toBe("not_run");
    }
    expect(releaseVerdict("queued", null)).toBe("pending");
    expect(releaseVerdict("in_progress", null)).toBe("pending");
  });

  it("reports a skipped Browser QA on the head as not_run, not failed", async () => {
    stubGithub({
      runs: [{ name: "Revora Browser QA", conclusion: "skipped" }],
      checks: [{ name: "Chromium rendered-site QA", conclusion: "skipped" }],
    });
    const evidence = await collectReleaseEvidence();
    expect(evidence.status).toBe("observed");
    expect(evidence.gates?.browser.verdict).toBe("not_run");
  });

  it("reports a CodeQL Analyze failure on the head as a failed codeql gate", async () => {
    stubGithub({
      runs: [{ name: "Revora Security Gate" }],
      checks: [
        { name: "Repository security audit" },
        { name: "Analyze (javascript-typescript)", conclusion: "failure" },
        { name: "CodeQL", app: "github-code-scanning", conclusion: "neutral" },
        { name: "OWASP ZAP passive baseline against CI app" },
      ],
    });
    const evidence = await collectReleaseEvidence();
    expect(evidence.gates?.security.verdict).toBe("passed");
    expect(evidence.gates?.codeql.verdict).toBe("failed");
    expect(evidence.gates?.zap.verdict).toBe("passed");
    expect(evidence.gates?.semgrep.verdict).toBe("missing");
    expect(evidence.missingGates).toContain("trivy");
    expect(evidence.checkRuns?.find((check) => check.name === "CodeQL")).toMatchObject({ app: "github-code-scanning", verdict: "not_run" });
  });

  it("never counts a historical success on an older commit as passed", async () => {
    stubGithub({
      runs: [{ name: "Revora Quality Gate", head_sha: OLD }],
      checks: [{ name: "Typecheck, lint, test, build", head_sha: OLD }, { name: "Repository security audit" }],
    });
    const evidence = await collectReleaseEvidence();
    expect(evidence.gates?.quality.verdict).toBe("missing");
    expect(evidence.runs[0]).toMatchObject({ name: "Revora Quality Gate", onHead: false, verdict: "not_on_head" });
  });

  it("treats a branch move between reads as unreadable check runs, not missing gates that look complete", async () => {
    stubGithub({ checks: [{ name: "Analyze (javascript-typescript)", head_sha: OLD }] });
    const evidence = await collectReleaseEvidence();
    expect(evidence.status).toBe("needs_verification");
    expect(evidence.checkRunsRead).toBe(false);
    expect(evidence.checkRunsReason).toBe("branch_moved_during_read");
  });

  it("returns needs_verification on a 403 from GitHub", async () => {
    stubGithub({ status: 403 });
    const evidence = await collectReleaseEvidence();
    expect(evidence).toMatchObject({ status: "needs_verification", reason: "github_access_or_rate_limit", branchHeadCommit: null });
  });

  it("keeps workflow evidence but needs verification when only check runs are forbidden", async () => {
    stubGithub({ runs: [{ name: "Revora Quality Gate" }], checksStatus: 403 });
    const evidence = await collectReleaseEvidence();
    expect(evidence).toMatchObject({ status: "needs_verification", reason: "github_access_or_rate_limit", checkRunsRead: false });
    expect(evidence.gates?.quality.verdict).toBe("passed");
    expect(evidence.gates?.codeql.verdict).toBe("missing");
  });

  it("uses only REVORA_GITHUB_READ_TOKEN and stays under 9 KB with many check runs", async () => {
    vi.stubEnv("REVORA_GITHUB_READ_TOKEN", "test-read-token");
    vi.stubEnv("GITHUB_TOKEN", "must-not-be-used");
    const { fetchMock } = stubGithub({
      runs: Array.from({ length: 100 }, (_, index) => ({ name: index % 2 ? "Revora Quality Gate" : "Revora Security Gate" })),
      checks: Array.from({ length: 100 }, (_, index) => ({
        name: `Job ${index} with a long descriptive name that GitHub reports for this check`,
        conclusion: index % 3 ? "success" : "skipped",
      })),
    });
    const evidence = await collectReleaseEvidence();
    expect(new TextEncoder().encode(JSON.stringify(evidence)).byteLength).toBeLessThan(9000);
    expect(evidence.omittedCheckRuns).toBeGreaterThan(0);
    for (const call of fetchMock.mock.calls) {
      const headers = (call[1] as RequestInit).headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer test-read-token");
    }
  });
});
