import { Buffer } from "node:buffer";
import { applyEdits, type PullRequestProposal } from "./jarvis-actions";

const REPO = "Revora3030/customer-forge";
const BASE = "lovable-sync";

type GitHubError = Error & { status?: number };

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
    // Workers reject redirect: "error"; any 3xx fails the ok check below.
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    let detail = "";
    try {
      detail = String(((await response.json()) as { message?: unknown }).message ?? "").slice(0, 200);
    } catch {
      /* no JSON body */
    }
    const error: GitHubError = new Error(`GitHub ${response.status}${detail ? `: ${detail}` : ""}`);
    error.status = response.status;
    throw error;
  }
  return (await response.json()) as T;
}

const branchSlug = (title: string) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "change";

/**
 * Opens a pull request into lovable-sync with Jarvis's proposed changes.
 * Edits apply to the current branch head and fail closed if the text they
 * target is missing or ambiguous. Nothing is merged; a person reviews it.
 */
export async function openJarvisPullRequest(pr: PullRequestProposal) {
  const token = process.env["REVORA_GITHUB_WRITE_TOKEN"]?.trim();
  if (!token)
    throw new Error(
      "GitHub write access isn't set up. Add a REVORA_GITHUB_WRITE_TOKEN secret: a fine-grained token for Revora3030/customer-forge with Contents and Pull requests set to Read and write.",
    );

  const ref = await gh<{ object: { sha: string } }>(token, `git/ref/heads/${BASE}`);
  const baseSha = ref.object.sha;
  const baseCommit = await gh<{ tree: { sha: string } }>(token, `git/commits/${baseSha}`);

  const tree = await Promise.all(
    pr.changes.map(async (change) => {
      const encodedPath = change.path.split("/").map(encodeURIComponent).join("/");
      let existing: string | null = null;
      try {
        const file = await gh<{ encoding?: string; content?: string }>(token, `contents/${encodedPath}?ref=${baseSha}`);
        existing = file.encoding === "base64" && typeof file.content === "string" ? Buffer.from(file.content, "base64").toString("utf8") : null;
      } catch (error) {
        if ((error as GitHubError).status !== 404) throw error;
      }
      let content: string;
      if ("content" in change) {
        if (existing !== null) throw new Error(`${change.path} already exists. Jarvis must edit it instead of replacing it.`);
        content = change.content;
      } else {
        if (existing === null) throw new Error(`${change.path} doesn't exist on ${BASE}.`);
        content = applyEdits(existing, change.edits, change.path);
        if (content === existing) throw new Error(`${change.path}: the edits change nothing.`);
      }
      return { path: change.path, mode: "100644", type: "blob", content };
    }),
  );

  const newTree = await gh<{ sha: string }>(token, "git/trees", { method: "POST", body: { base_tree: baseCommit.tree.sha, tree } });
  const commit = await gh<{ sha: string }>(token, "git/commits", {
    method: "POST",
    body: { message: `${pr.title}\n\n${pr.summary}\n\nProposed by Jarvis and approved by an admin.`, tree: newTree.sha, parents: [baseSha] },
  });
  const branch = `jarvis/${branchSlug(pr.title)}-${Date.now().toString(36)}`;
  await gh(token, "git/refs", { method: "POST", body: { ref: `refs/heads/${branch}`, sha: commit.sha } });
  const pull = await gh<{ html_url: string; number: number }>(token, "pulls", {
    method: "POST",
    body: {
      title: pr.title,
      head: branch,
      base: BASE,
      draft: false,
      body: [
        pr.summary,
        "",
        "### Files",
        ...pr.changes.map((change) => `- \`${change.path}\` (${"content" in change ? "new file" : `${change.edits.length} edit${change.edits.length === 1 ? "" : "s"}`})`),
        "",
        "---",
        "Proposed by Jarvis (free AI pool) and approved in Revora by an admin. Not tested by Jarvis: check CI and review the diff before merging.",
      ].join("\n"),
    },
  });
  return { url: pull.html_url, number: pull.number, branch };
}
