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
      return {
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
