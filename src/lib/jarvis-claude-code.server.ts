/**
 * Claude Code from Jarvis. A request becomes a GitHub issue labelled
 * "claude-code", which starts .github/workflows/claude-code.yml. Claude works
 * on its own branch and reports on the issue, including the pull request link.
 * Nothing reaches lovable-sync until a person merges that pull request.
 */

const REPO = "Revora3030/customer-forge";
export const CLAUDE_CODE_LABEL = "claude-code";

export type ClaudeCodeRequest = {
  number: number;
  title: string;
  state: "open" | "closed";
  url: string;
  updatedAt: string;
  comments: number;
  latest: string | null;
  /** The pull request for this request, once Claude Code has pushed its branch. */
  pullRequestUrl?: string | null;
};

function writeToken() {
  const token = process.env["REVORA_GITHUB_WRITE_TOKEN"]?.trim();
  if (!token)
    throw new Error(
      "GitHub write access isn't set up. Add a REVORA_GITHUB_WRITE_TOKEN secret: a fine-grained token for Revora3030/customer-forge with Issues, Contents and Pull requests set to Read and write.",
    );
  return token;
}

async function gh<T>(token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "revora-jarvis",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    if (response.status === 403 || response.status === 404)
      throw new Error(
        "GitHub refused the request. Give REVORA_GITHUB_WRITE_TOKEN Issues: Read and write on Revora3030/customer-forge.",
      );
    throw new Error(`GitHub answered ${response.status}. Try again in a moment.`);
  }
  return (await response.json()) as T;
}

/** The issue title: the request's first line, trimmed to fit GitHub's list view. */
export function claudeCodeTitle(request: string) {
  const first = request.trim().split("\n")[0]!.replace(/\s+/g, " ");
  return first.length > 90 ? `${first.slice(0, 87)}…` : first;
}

export function claudeCodeBody(request: string, requestedBy: string) {
  return [
    request.trim(),
    "",
    "---",
    `Sent from Jarvis by ${requestedBy}. Follow AGENTS.md: work on a new branch, keep lovable-sync's history intact, run the repo's checks, and open a pull request into lovable-sync when the change is ready.`,
  ].join("\n");
}

export async function sendClaudeCodeRequest(request: string, requestedBy: string) {
  const token = writeToken();
  const issue = await gh<{ number: number; html_url: string }>(token, "issues", {
    method: "POST",
    body: {
      title: claudeCodeTitle(request),
      body: claudeCodeBody(request, requestedBy),
      labels: [CLAUDE_CODE_LABEL],
    },
  });
  return { number: issue.number, url: issue.html_url };
}

type IssueRow = {
  number: number;
  title: string;
  state: "open" | "closed";
  html_url: string;
  updated_at: string;
  comments: number;
  pull_request?: unknown;
};

export async function listClaudeCodeRequests(limit = 8): Promise<ClaudeCodeRequest[]> {
  const token = writeToken();
  const issues = (
    await gh<IssueRow[]>(token, `issues?labels=${CLAUDE_CODE_LABEL}&state=all&sort=created&direction=desc&per_page=${limit}`)
  ).filter((issue) => !issue.pull_request);
  return Promise.all(
    issues.map(async (issue) => {
      let latest: string | null = null;
      if (issue.comments > 0) {
        const comments = await gh<{ body: string }[]>(token, `issues/${issue.number}/comments?per_page=100`).catch(() => []);
        latest = comments.at(-1)?.body?.slice(0, 1200) ?? null;
      }
      // Claude Code pushes a branch; make sure it always ends in a pull request.
      const pull = issue.state === "open" ? await openClaudeCodePullRequest(issue).catch(() => null) : null;
      return {
        pullRequestUrl: pull?.url ?? null,
        number: issue.number,
        title: issue.title,
        state: issue.state,
        url: issue.html_url,
        updatedAt: issue.updated_at,
        comments: issue.comments,
        latest,
      };
    }),
  );
}

type CheckRun = { name: string; status: string; conclusion: string | null };

/** The failing check names on a pull request's head commit. */
async function failingChecks(token: string, pr: number): Promise<string[]> {
  const pull = await gh<{ head: { sha: string } }>(token, `pulls/${pr}`);
  const runs = await gh<{ check_runs: CheckRun[] }>(token, `commits/${pull.head.sha}/check-runs?per_page=100`);
  return [
    ...new Set(
      runs.check_runs
        .filter((run) => run.status === "completed" && ["failure", "timed_out", "action_required"].includes(run.conclusion ?? ""))
        .map((run) => run.name),
    ),
  ];
}

/** The "@claude" comment that asks Claude Code to fix a pull request. */
export function claudeFixComment(failing: string[], note: string, requestedBy: string) {
  return [
    "@claude please fix this pull request so it is ready to merge into lovable-sync.",
    failing.length
      ? `Failing checks on the current head: ${failing.join(", ")}. Read their logs, find the root cause and fix it.`
      : "No checks are failing right now; address the open review comments.",
    ...(note ? ["", note] : []),
    "",
    "Follow AGENTS.md. Push to this pull request's branch with normal commits (no force-push), run the repo's typecheck, lint and tests before pushing, and never skip or disable a test to get green.",
    "",
    `Requested from Jarvis by ${requestedBy}.`,
  ].join("\n");
}

/** Asks Claude Code to fix one pull request's failing checks or review comments. */
export async function askClaudeToFixPullRequest(pr: number, note: string, requestedBy: string) {
  const token = writeToken();
  const failing = await failingChecks(token, pr);
  const comment = await gh<{ html_url: string }>(token, `issues/${pr}/comments`, {
    method: "POST",
    body: { body: claudeFixComment(failing, note.trim().slice(0, 2000), requestedBy) },
  });
  return { url: comment.html_url, failing };
}

/** Branch Claude Code's action creates for an issue: claude/issue-<n>-<timestamp>. */
export function claudeIssueBranch(names: string[], issue: number): string | null {
  const prefix = `claude/issue-${issue}-`;
  return names.filter((name) => name.startsWith(prefix)).sort().at(-1) ?? null;
}

/**
 * Opens the pull request for a Claude Code request once its branch exists, so
 * every request ends in a reviewable PR into lovable-sync. Opened with the
 * owner's token, which (unlike the workflow's own token) starts CI. Returns
 * the existing PR when there already is one.
 */
export async function openClaudeCodePullRequest(issue: { number: number; title: string }) {
  const token = writeToken();
  const owner = REPO.split("/")[0]!;
  const matching = await gh<{ ref: string }[]>(token, `git/matching-refs/heads/claude/issue-${issue.number}-`).catch(() => []);
  const branch = claudeIssueBranch(
    matching.map((row) => row.ref.replace(/^refs\/heads\//, "")),
    issue.number,
  );
  if (!branch) return null;
  const open = await gh<{ html_url: string; number: number }[]>(token, `pulls?state=all&head=${owner}:${encodeURIComponent(branch)}`);
  if (open[0]) return { url: open[0].html_url, number: open[0].number, branch };
  const pull = await gh<{ html_url: string; number: number }>(token, "pulls", {
    method: "POST",
    body: {
      title: issue.title,
      head: branch,
      base: "lovable-sync",
      body: `Closes #${issue.number}\n\nWritten by Claude Code from a Jarvis request. Review the diff and CI before merging.`,
    },
  });
  return { url: pull.html_url, number: pull.number, branch };
}
